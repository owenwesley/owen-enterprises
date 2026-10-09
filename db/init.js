/**
 * db/init.js
 *
 * Runs once on server startup.
 * Connects to MySQL without a database, then:
 *   1. Creates each database if it does not exist.
 *   2. Creates each table if it does not exist.
 *   3. For tables that already exist, adds any columns the definition below has
 *      that the table lacks (see db/schemaSync.js). Add a column here and it
 *      appears in existing databases on the next start.
 *
 * Uses mysql2/promise for clean async/await — no callbacks.
 */

const mysql = require('mysql2/promise');
const { syncColumns, syncEnums } = require('./schemaSync');

function baseConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    port: Number(process.env.DB_PORT) || 3306,
    multipleStatements: true,
  };
}

function dbNames() {
  return {
    gateway:          process.env.DB_GATEWAY          || 'owenenterprises',
    bgtracker:        process.env.DB_BGTRACKER        || 'bgtracker',
    communitylibrary: process.env.DB_COMMUNITYLIBRARY || 'communitylibrary',
    meetings:         process.env.DB_MEETINGS         || 'meetings',
    church:           process.env.DB_CHURCH           || 'church',
  };
}

function tableMap(names) {
  return {
    [names.gateway]: [
      {
        name: 'users',
        sql: `CREATE TABLE IF NOT EXISTS users (
          id        INT AUTO_INCREMENT PRIMARY KEY,
          firstName VARCHAR(100) NOT NULL,
          lastName  VARCHAR(100) NOT NULL,
          userName  VARCHAR(100) NOT NULL UNIQUE,
          password  VARCHAR(255) NOT NULL,
          email     VARCHAR(255) NOT NULL,
          role         ENUM('patient','doctor','admin') NOT NULL DEFAULT 'patient',
          doctorStatus ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        // A doctor's current workplace. Deliberately just informational — it
        // does not gate anything and changing it never touches doctor_patients.
        // A doctor is a verified, individually-approved account; the clinic
        // they currently work at is metadata about that account, not a second
        // layer of access control. See the "Clinics" section of the README for
        // why patient links aren't tied to it.
        name: 'clinics',
        sql: `CREATE TABLE IF NOT EXISTS clinics (
          id        INT AUTO_INCREMENT PRIMARY KEY,
          name      VARCHAR(150) NOT NULL,
          address   VARCHAR(255) NOT NULL DEFAULT '',
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        name: 'doctor_profiles',
        sql: `CREATE TABLE IF NOT EXISTS doctor_profiles (
          user_id       INT          PRIMARY KEY,
          licenseNumber VARCHAR(64)  NOT NULL,
          specialty     VARCHAR(100) NOT NULL DEFAULT '',
          inviteCode    VARCHAR(12)  UNIQUE,
          clinic_id     INT          NULL,
          requestedClinicId   INT NULL,
          clinicRequestStatus ENUM('none','pending') NOT NULL DEFAULT 'none',
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        // Doctor ↔ patient links. Patient-initiated only, via the doctor's
        // inviteCode: entering a valid code IS the patient's consent, so a
        // new link is 'active' immediately — there is no separate doctor-side
        // acceptance step to build yet. `status` still allows for that later
        // without a schema change. Sharing is per-link and per-data-type, so
        // one patient can share different things with different doctors.
        name: 'doctor_patients',
        sql: `CREATE TABLE IF NOT EXISTS doctor_patients (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          doctor_id     INT NOT NULL,
          patient_id    INT NOT NULL,
          status        ENUM('pending','active','revoked') NOT NULL DEFAULT 'active',
          requestedBy   ENUM('doctor','patient') NOT NULL DEFAULT 'patient',
          shareBP         TINYINT(1) NOT NULL DEFAULT 1,
          shareWeight     TINYINT(1) NOT NULL DEFAULT 1,
          shareReadings   TINYINT(1) NOT NULL DEFAULT 1,
          shareMedications TINYINT(1) NOT NULL DEFAULT 1,
          createdAt     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_doctor_patient (doctor_id, patient_id),
          FOREIGN KEY (doctor_id)  REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        name: 'feature_preferences',
        sql: `CREATE TABLE IF NOT EXISTS feature_preferences (
          id                  INT AUTO_INCREMENT PRIMARY KEY,
          user_id             INT        NOT NULL UNIQUE,
          chkBgtracker        TINYINT(1) NOT NULL DEFAULT 0,
          chkCommunityLibrary TINYINT(1) NOT NULL DEFAULT 0,
          chkMeetings         TINYINT(1) NOT NULL DEFAULT 0,
          chkChurch           TINYINT(1) NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        // One row per person per consent form version they accepted. A new
        // form version adds a new row; old rows are kept as the record.
        name: 'hipaa_consents',
        sql: `CREATE TABLE IF NOT EXISTS hipaa_consents (
          id          INT AUTO_INCREMENT PRIMARY KEY,
          user_id     INT         NOT NULL,
          formKey     VARCHAR(60) NOT NULL,
          formVersion VARCHAR(20) NOT NULL,
          ipAddress   VARCHAR(45) NOT NULL DEFAULT '',
          acceptedAt  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_consent (user_id, formKey, formVersion),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        // Who touched BGTracker data. user_id is the person acting and
        // patient_id the person whose data it was (NULL for your own data).
        // The foreign keys say SET NULL, but db/maintenance/deleteUser.js (and so
        // DELETE /auth/account) deletes by column NAME, so every row whose user_id
        // OR patient_id is the deleted person is removed too, including rows about
        // them written when a doctor looked at their data. The consent forms say
        // this. To keep the log instead: skip audit_log in deleteUser.js and change
        // the forms (config/hipaaForms.js, raise the version).
        name: 'audit_log',
        sql: `CREATE TABLE IF NOT EXISTS audit_log (
          id         INT AUTO_INCREMENT PRIMARY KEY,
          user_id    INT          NULL,
          patient_id INT          NULL,
          action     VARCHAR(40)  NOT NULL,
          resource   VARCHAR(255) NOT NULL,
          outcome    ENUM('allowed','denied') NOT NULL,
          ipAddress  VARCHAR(45)  NOT NULL DEFAULT '',
          detail     VARCHAR(255) NOT NULL DEFAULT '',
          createdAt  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_audit_user (user_id, createdAt),
          KEY idx_audit_patient (patient_id, createdAt),
          FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        // Two-step sign-in. Now by text message: phoneEnc is the phone number (stored
        // encrypted) and pendingPhoneEnc one being confirmed. secretEnc and lastCounter
        // belong to the older authenticator-app method and are only used for people who
        // enrolled that way before the switch.
        name: 'user_mfa',
        sql: `CREATE TABLE IF NOT EXISTS user_mfa (
          user_id     INT          PRIMARY KEY,
          secretEnc   VARCHAR(255) NOT NULL DEFAULT '',
          enabled     TINYINT(1)   NOT NULL DEFAULT 0,
          lastCounter BIGINT       NOT NULL DEFAULT 0,
          pendingPhoneEnc VARCHAR(255) NOT NULL DEFAULT '',
          phoneEnc        VARCHAR(255) NOT NULL DEFAULT '',
          phoneLast4      CHAR(4)      NOT NULL DEFAULT '',
          createdAt   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        // One-time recovery codes (only a hash is kept).
        name: 'mfa_recovery_codes',
        sql: `CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
          id       INT AUTO_INCREMENT PRIMARY KEY,
          user_id  INT         NOT NULL,
          codeHash CHAR(64)    NOT NULL,
          usedAt   TIMESTAMP   NULL,
          UNIQUE KEY uq_recovery (user_id, codeHash),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        // Phones we agreed not to ask again on. Only a hash of the device token is
        // kept; the token itself lives in that browser. Lasts 30 days.
        name: 'mfa_trusted_devices',
        sql: `CREATE TABLE IF NOT EXISTS mfa_trusted_devices (
          id         INT AUTO_INCREMENT PRIMARY KEY,
          user_id    INT          NOT NULL,
          tokenHash  CHAR(64)     NOT NULL,
          label      VARCHAR(120) NOT NULL DEFAULT '',
          createdAt  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expiresAt  DATETIME     NOT NULL,
          lastUsedAt DATETIME     NULL,
          UNIQUE KEY uq_device (tokenHash),
          KEY idx_device_user (user_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
    ],

    [names.bgtracker]: [
      {
        name: 'readings',
        sql: `CREATE TABLE IF NOT EXISTS readings (
          id          INT AUTO_INCREMENT PRIMARY KEY,
          user_id     INT NOT NULL,
          date        TEXT NOT NULL,
          sugarB      INT NOT NULL, carbsB   INT NOT NULL,
          insulinSB   INT NOT NULL,
          insulinFB   INT NOT NULL, chkMedsB  TINYINT(1) NOT NULL,
          sugarL      INT NOT NULL, carbsL   INT NOT NULL,
          insulinL    INT NOT NULL, chkMedsL  TINYINT(1) NOT NULL,
          sugarD      INT NOT NULL, carbsD   INT NOT NULL,
          insulinD    INT NOT NULL, chkMedsD  TINYINT(1) NOT NULL,
          sugarBB     INT NOT NULL, carbsBB  INT NOT NULL, insulinBB  INT NOT NULL,
          sugarBed    INT NOT NULL, carbsBed INT NOT NULL,
          insulinSBed INT NOT NULL,
          insulinFBed INT NOT NULL, chkMedsBed  TINYINT(1) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        name: 'bloodpressures',
        sql: `CREATE TABLE IF NOT EXISTS bloodpressures (
          id      INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          date    VARCHAR(20) NOT NULL,
          hbp     INT NOT NULL, lbp  INT NOT NULL, hr   INT NOT NULL,
          hbp2    INT NOT NULL, lbp2 INT NOT NULL, hr2  INT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        name: 'medications',
        sql: `CREATE TABLE IF NOT EXISTS medications (
          id         INT AUTO_INCREMENT PRIMARY KEY,
          user_id    INT NOT NULL,
          name       VARCHAR(255) NOT NULL,
          dose       VARCHAR(50)  NOT NULL,
          unit       VARCHAR(20)  NOT NULL,
          quantity   INT NOT NULL,
          prescriber VARCHAR(255) NOT NULL,
          am         INT NOT NULL,
          noon       INT NOT NULL,
          evening    INT NOT NULL,
          bed        INT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        name: 'weights',
        sql: `CREATE TABLE IF NOT EXISTS weights (
          id      INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          date    VARCHAR(20) NOT NULL,
          kg      DECIMAL(6,2) NOT NULL,
          lbs     DECIMAL(6,2) NOT NULL,
          bmi     DECIMAL(6,2) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        name: 'nutritions',
        sql: `CREATE TABLE IF NOT EXISTS nutritions (
          id      INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          date    TEXT NOT NULL,
          foodNameB TEXT NOT NULL,
          caloriesB INT NOT NULL,
          saturatedB DOUBLE NOT NULL,
          transB DOUBLE NOT NULL,
          polyunsaturatedB DOUBLE NOT NULL,
          monosaturatedB DOUBLE NOT NULL,
          cholesterolB INT NOT NULL,
          sodiumB INT NOT NULL,
          carbsB INT NOT NULL,
          fiberB INT NOT NULL,
          sugarsB DOUBLE NOT NULL,
          proteinB DOUBLE NOT NULL,
          vitaminAB INT NOT NULL,
          vitaminCB INT NOT NULL,
          vitaminDB INT NOT NULL,
          calciumB INT NOT NULL,
          ironB DOUBLE NOT NULL,
          potassiumB INT NOT NULL,
          foodNameL TEXT NOT NULL,
          caloriesL INT NOT NULL,
          saturatedL DOUBLE NOT NULL,
          transL DOUBLE NOT NULL,
          polyunsaturatedL DOUBLE NOT NULL,
          monosaturatedL DOUBLE NOT NULL,
          cholesterolL INT NOT NULL,
          sodiumL INT NOT NULL,
          carbsL INT NOT NULL,
          fiberL INT NOT NULL,
          sugarsL DOUBLE NOT NULL,
          proteinL DOUBLE NOT NULL,
          vitaminAL INT NOT NULL,
          vitaminCL INT NOT NULL,
          vitaminDL INT NOT NULL,
          calciumL INT NOT NULL,
          ironL DOUBLE NOT NULL,
          potassiumL INT NOT NULL,
          foodNameD TEXT NOT NULL,
          caloriesD INT NOT NULL,
          saturatedD DOUBLE NOT NULL,
          transD DOUBLE NOT NULL,
          polyunsaturatedD DOUBLE NOT NULL,
          monosaturatedD DOUBLE NOT NULL,
          cholesterolD INT NOT NULL,
          sodiumD INT NOT NULL,
          carbsD INT NOT NULL,
          fiberD INT NOT NULL,
          sugarsD DOUBLE NOT NULL,
          proteinD DOUBLE NOT NULL,
          vitaminAD INT NOT NULL,
          vitaminCD INT NOT NULL,
          vitaminDD INT NOT NULL,
          calciumD INT NOT NULL,
          ironD DOUBLE NOT NULL,
          potassiumD INT NOT NULL,
          foodNameBB TEXT NOT NULL,
          caloriesBB INT NOT NULL,
          saturatedBB DOUBLE NOT NULL,
          transBB DOUBLE NOT NULL,
          polyunsaturatedBB DOUBLE NOT NULL,
          monosaturatedBB DOUBLE NOT NULL,
          cholesterolBB INT NOT NULL,
          sodiumBB INT NOT NULL,
          carbsBB INT NOT NULL,
          fiberBB INT NOT NULL,
          sugarsBB DOUBLE NOT NULL,
          proteinBB DOUBLE NOT NULL,
          vitaminABB INT NOT NULL,
          vitaminCBB INT NOT NULL,
          vitaminDBB INT NOT NULL,
          calciumBB INT NOT NULL,
          ironBB DOUBLE NOT NULL,
          potassiumBB INT NOT NULL,
          foodNameBed TEXT NOT NULL,
          caloriesBed INT NOT NULL,
          saturatedBed DOUBLE NOT NULL,
          transBed DOUBLE NOT NULL,
          polyunsaturatedBed DOUBLE NOT NULL,
          monosaturatedBed DOUBLE NOT NULL,
          cholesterolBed INT NOT NULL,
          sodiumBed INT NOT NULL,
          carbsBed INT NOT NULL,
          fiberBed INT NOT NULL,
          sugarsBed DOUBLE NOT NULL,
          proteinBed DOUBLE NOT NULL,
          vitaminABed INT NOT NULL,
          vitaminCBed INT NOT NULL,
          vitaminDBed INT NOT NULL,
          calciumBed INT NOT NULL,
          ironBed DOUBLE NOT NULL,
          potassiumBed INT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        name: 'preferences',
        sql: `CREATE TABLE IF NOT EXISTS preferences (
          id               INT AUTO_INCREMENT PRIMARY KEY,
          user_id          INT NOT NULL,
          timesPD          INT        NOT NULL,
          chkNutrition     TINYINT(1) NOT NULL,
          chkWeight        TINYINT(1) NOT NULL,
          height           INT        NOT NULL,
          chkMeds          TINYINT(1) NOT NULL,
          chkMedsB         TINYINT(1) NOT NULL,
          chkMedsL         TINYINT(1) NOT NULL,
          chkMedsD         TINYINT(1) NOT NULL,
          chkMedsBed       TINYINT(1) NOT NULL,
          chkInsulin       TINYINT(1) NOT NULL,
          typInsulin       INT        NOT NULL,
          chkBP            TINYINT(1) NOT NULL,
          chkSlidingScale  TINYINT(1) NOT NULL,
          slidingScale1    INT        NOT NULL,
          slidingScale2a   INT        NOT NULL,
          slidingScale2b   INT        NOT NULL,
          slidingScale3a   INT        NOT NULL,
          slidingScale3b   INT        NOT NULL,
          slidingScale4a   INT        NOT NULL,
          slidingScale4b   INT        NOT NULL,
          slidingScale5    INT        NOT NULL,
          carbRatio        DECIMAL(10,4) NOT NULL,
          calorieGoal      INT        NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
    ],

    [names.communitylibrary]: [
      {
        name: 'books',
        sql: `CREATE TABLE IF NOT EXISTS books (
          id        INT AUTO_INCREMENT PRIMARY KEY,
          user_id   INT NOT NULL,
          title     VARCHAR(255) NOT NULL DEFAULT '',
          author    VARCHAR(255) NOT NULL DEFAULT '',
          publisher VARCHAR(255) NOT NULL DEFAULT '',
          copywrite INT          NOT NULL DEFAULT 0,
          isbn      VARCHAR(50)  NOT NULL DEFAULT '',
          io        TINYINT(1)   NOT NULL DEFAULT 1,
          who       VARCHAR(255) NOT NULL DEFAULT 'In Library',
          lost      TINYINT(1)   NOT NULL DEFAULT 0,
          img_url   VARCHAR(500) NOT NULL DEFAULT ''
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        name: 'movies',
        sql: `CREATE TABLE IF NOT EXISTS movies (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          user_id       INT NOT NULL,
          name          VARCHAR(255) NOT NULL DEFAULT '',
          featureMedia  VARCHAR(100) NOT NULL DEFAULT '',
          numMovie      INT NOT NULL DEFAULT 1,
          name1   VARCHAR(255) NOT NULL DEFAULT '',
          rated1  VARCHAR(20)  NOT NULL DEFAULT 'NR',
          length1 INT NOT NULL DEFAULT 0,
          yearR1  INT NOT NULL DEFAULT 0,
          media1  VARCHAR(50)  NOT NULL DEFAULT 'DVD',
          io1     TINYINT(1)   NOT NULL DEFAULT 1,
          who1    VARCHAR(255) NOT NULL DEFAULT 'In Library',
          img1    VARCHAR(500) NOT NULL DEFAULT '',
          name2   VARCHAR(255) NOT NULL DEFAULT '',
          rated2  VARCHAR(20)  NOT NULL DEFAULT 'NR',
          length2 INT NOT NULL DEFAULT 0,
          yearR2  INT NOT NULL DEFAULT 0,
          media2  VARCHAR(50)  NOT NULL DEFAULT 'DVD',
          io2     TINYINT(1)   NOT NULL DEFAULT 1,
          who2    VARCHAR(255) NOT NULL DEFAULT 'In Library',
          img2    VARCHAR(500) NOT NULL DEFAULT '',
          name3   VARCHAR(255) NOT NULL DEFAULT '',
          rated3  VARCHAR(20)  NOT NULL DEFAULT 'NR',
          length3 INT NOT NULL DEFAULT 0,
          yearR3  INT NOT NULL DEFAULT 0,
          media3  VARCHAR(50)  NOT NULL DEFAULT 'DVD',
          io3     TINYINT(1)   NOT NULL DEFAULT 1,
          who3    VARCHAR(255) NOT NULL DEFAULT 'In Library',
          img3    VARCHAR(500) NOT NULL DEFAULT '',
          name4   VARCHAR(255) NOT NULL DEFAULT '',
          rated4  VARCHAR(20)  NOT NULL DEFAULT 'NR',
          length4 INT NOT NULL DEFAULT 0,
          yearR4  INT NOT NULL DEFAULT 0,
          media4  VARCHAR(50)  NOT NULL DEFAULT 'DVD',
          io4     TINYINT(1)   NOT NULL DEFAULT 1,
          who4    VARCHAR(255) NOT NULL DEFAULT 'In Library',
          img4    VARCHAR(500) NOT NULL DEFAULT '',
          name5   VARCHAR(255) NOT NULL DEFAULT '',
          rated5  VARCHAR(20)  NOT NULL DEFAULT 'NR',
          length5 INT NOT NULL DEFAULT 0,
          yearR5  INT NOT NULL DEFAULT 0,
          media5  VARCHAR(50)  NOT NULL DEFAULT 'DVD',
          io5     TINYINT(1)   NOT NULL DEFAULT 1,
          who5    VARCHAR(255) NOT NULL DEFAULT 'In Library',
          img5    VARCHAR(500) NOT NULL DEFAULT '',
          name6   VARCHAR(255) NOT NULL DEFAULT '',
          rated6  VARCHAR(20)  NOT NULL DEFAULT 'NR',
          length6 INT NOT NULL DEFAULT 0,
          yearR6  INT NOT NULL DEFAULT 0,
          media6  VARCHAR(50)  NOT NULL DEFAULT 'DVD',
          io6     TINYINT(1)   NOT NULL DEFAULT 1,
          who6    VARCHAR(255) NOT NULL DEFAULT 'In Library',
          img6    VARCHAR(500) NOT NULL DEFAULT '',
          name7   VARCHAR(255) NOT NULL DEFAULT '',
          rated7  VARCHAR(20)  NOT NULL DEFAULT 'NR',
          length7 INT NOT NULL DEFAULT 0,
          yearR7  INT NOT NULL DEFAULT 0,
          media7  VARCHAR(50)  NOT NULL DEFAULT 'DVD',
          io7     TINYINT(1)   NOT NULL DEFAULT 1,
          who7    VARCHAR(255) NOT NULL DEFAULT 'In Library',
          img7    VARCHAR(500) NOT NULL DEFAULT '',
          name8   VARCHAR(255) NOT NULL DEFAULT '',
          rated8  VARCHAR(20)  NOT NULL DEFAULT 'NR',
          length8 INT NOT NULL DEFAULT 0,
          yearR8  INT NOT NULL DEFAULT 0,
          media8  VARCHAR(50)  NOT NULL DEFAULT 'DVD',
          io8     TINYINT(1)   NOT NULL DEFAULT 1,
          who8    VARCHAR(255) NOT NULL DEFAULT 'In Library',
          img8    VARCHAR(500) NOT NULL DEFAULT '',
          name9   VARCHAR(255) NOT NULL DEFAULT '',
          rated9  VARCHAR(20)  NOT NULL DEFAULT 'NR',
          length9 INT NOT NULL DEFAULT 0,
          yearR9  INT NOT NULL DEFAULT 0,
          media9  VARCHAR(50)  NOT NULL DEFAULT 'DVD',
          io9     TINYINT(1)   NOT NULL DEFAULT 1,
          who9    VARCHAR(255) NOT NULL DEFAULT 'In Library',
          img9    VARCHAR(500) NOT NULL DEFAULT '',
          name10   VARCHAR(255) NOT NULL DEFAULT '',
          rated10  VARCHAR(20)  NOT NULL DEFAULT 'NR',
          length10 INT NOT NULL DEFAULT 0,
          yearR10  INT NOT NULL DEFAULT 0,
          media10  VARCHAR(50)  NOT NULL DEFAULT 'DVD',
          io10     TINYINT(1)   NOT NULL DEFAULT 1,
          who10    VARCHAR(255) NOT NULL DEFAULT 'In Library',
          img10    VARCHAR(500) NOT NULL DEFAULT '',
          name11   VARCHAR(255) NOT NULL DEFAULT '',
          rated11  VARCHAR(20)  NOT NULL DEFAULT 'NR',
          length11 INT NOT NULL DEFAULT 0,
          yearR11  INT NOT NULL DEFAULT 0,
          media11  VARCHAR(50)  NOT NULL DEFAULT 'DVD',
          io11     TINYINT(1)   NOT NULL DEFAULT 1,
          who11    VARCHAR(255) NOT NULL DEFAULT 'In Library',
          img11    VARCHAR(500) NOT NULL DEFAULT '',
          name12   VARCHAR(255) NOT NULL DEFAULT '',
          rated12  VARCHAR(20)  NOT NULL DEFAULT 'NR',
          length12 INT NOT NULL DEFAULT 0,
          yearR12  INT NOT NULL DEFAULT 0,
          media12  VARCHAR(50)  NOT NULL DEFAULT 'DVD',
          io12     TINYINT(1)   NOT NULL DEFAULT 1,
          who12    VARCHAR(255) NOT NULL DEFAULT 'In Library',
          img12    VARCHAR(500) NOT NULL DEFAULT '',
          io      TINYINT(1) NOT NULL DEFAULT 1,
          who     VARCHAR(255) NOT NULL DEFAULT 'In Library',
          lost    TINYINT(1) NOT NULL DEFAULT 0,
          img_url VARCHAR(500) NOT NULL DEFAULT ''
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        name: 'contacts',
        sql: `CREATE TABLE IF NOT EXISTS contacts (
          id        INT AUTO_INCREMENT PRIMARY KEY,
          user_id   INT NOT NULL,
          firstName VARCHAR(100) NOT NULL DEFAULT '',
          lastName  VARCHAR(100) NOT NULL DEFAULT '',
          phoneNum  VARCHAR(50)  NOT NULL DEFAULT '',
          email     VARCHAR(255) NOT NULL DEFAULT '',
          address   VARCHAR(500) NOT NULL DEFAULT ''
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
    ],

    [names.meetings]: [
      {
        name: 'meetings',
        sql: `CREATE TABLE IF NOT EXISTS meetings (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          user_id       INT NOT NULL,
          date          VARCHAR(20)  NOT NULL,
          chair         VARCHAR(100) NOT NULL,
          coChair       VARCHAR(100) NOT NULL,
          newComer      INT NOT NULL,
          day30         INT NOT NULL, day60  INT NOT NULL, day90  INT NOT NULL,
          month6        INT NOT NULL, month9 INT NOT NULL,
          month12       INT NOT NULL, month18 INT NOT NULL, multiyr INT NOT NULL,
          gc1           INT NOT NULL, gc2  INT NOT NULL, gc3  INT NOT NULL,
          gc4           INT NOT NULL, gc5  INT NOT NULL, gc6  INT NOT NULL,
          gc7           INT NOT NULL, gc8  INT NOT NULL, gc9  INT NOT NULL,
          gc10          INT NOT NULL,
          attendance    INT NOT NULL,
          memo          VARCHAR(255) NOT NULL,
          deposit       DECIMAL(10,2) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        name: 'chairs',
        sql: `CREATE TABLE IF NOT EXISTS chairs (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          user_id       INT NOT NULL,
          name          VARCHAR(20) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        name: 'memos',
        sql: `CREATE TABLE IF NOT EXISTS memos (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          user_id       INT NOT NULL,
          name          VARCHAR(20) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
    ],

    [names.church]: [
      {
        name: 'churches',
        sql: `CREATE TABLE IF NOT EXISTS churches (
          id               INT AUTO_INCREMENT PRIMARY KEY,
          name             VARCHAR(150)  NOT NULL,
          missionStatement VARCHAR(2000) NOT NULL DEFAULT '',
          joinCode         VARCHAR(8)    NOT NULL UNIQUE,
          status           ENUM('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
          areaAnnouncements TINYINT(1)    NOT NULL DEFAULT 1,
          areaLibrary       TINYINT(1)    NOT NULL DEFAULT 1,
          areaContacts      TINYINT(1)    NOT NULL DEFAULT 1,
          createdAt        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        name: 'members',
        sql: `CREATE TABLE IF NOT EXISTS members (
          id        INT AUTO_INCREMENT PRIMARY KEY,
          church_id INT NOT NULL,
          user_id   INT NOT NULL,
          role      ENUM('owner','leader','treasurer','missions','member') NOT NULL DEFAULT 'member',
          status    ENUM('pending','active','removed') NOT NULL DEFAULT 'pending',
          shareLibrary TINYINT(1) NOT NULL DEFAULT 0,
          shareContact TINYINT(1) NOT NULL DEFAULT 0,
          contactPhone   VARCHAR(50)  NOT NULL DEFAULT '',
          contactAddress VARCHAR(500) NOT NULL DEFAULT '',
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_church_user (church_id, user_id),
          FOREIGN KEY (church_id) REFERENCES churches(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        name: 'announcements',
        sql: `CREATE TABLE IF NOT EXISTS announcements (
          id         INT AUTO_INCREMENT PRIMARY KEY,
          church_id  INT NOT NULL,
          user_id    INT NOT NULL,
          title      VARCHAR(150)  NOT NULL,
          body       VARCHAR(4000) NOT NULL DEFAULT '',
          createdAt  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_church_created (church_id, createdAt),
          FOREIGN KEY (church_id) REFERENCES churches(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
      {
        name: 'borrow_requests',
        sql: `CREATE TABLE IF NOT EXISTS borrow_requests (
          id           INT AUTO_INCREMENT PRIMARY KEY,
          user_id      INT NOT NULL,
          requester_id INT NOT NULL,
          kind         ENUM('book','movie') NOT NULL,
          item_id      INT NOT NULL,
          title        VARCHAR(255) NOT NULL,
          note         VARCHAR(500) NOT NULL DEFAULT '',
          status       ENUM('pending','accepted','declined','cancelled') NOT NULL DEFAULT 'pending',
          createdAt    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_owner (user_id, status),
          KEY idx_requester (requester_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      },
    ],
  };
}

const ok   = (msg) => console.log(`  ✓  ${msg}`);
const skip = (msg) => console.log(`  –  ${msg} (already exists)`);
const err  = (msg, e) => console.error(`  ✗  ${msg}:`, e.message);

async function dbExists(conn, name) {
  const [rows] = await conn.query(
    `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
    [name]
  );
  return rows.length > 0;
}

async function tableExists(conn, db, table) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, table]
  );
  return rows.length > 0;
}

async function initDatabases() {
  console.log('\n──────────────────────────────────────────');
  console.log('  OwenEnterprises — database initialisation');
  console.log('──────────────────────────────────────────');

  let conn;
  try {
    conn = await mysql.createConnection(baseConfig());
  } catch (e) {
    console.error('✗  Could not connect to MySQL:', e.message);
    console.error('   Check DB_HOST, DB_USER, DB_PASS, DB_PORT in your .env file.');
    process.exit(1);
  }

  const names  = dbNames();
  const tables = tableMap(names);

  console.log('\n  Databases:');
  for (const dbName of Object.keys(tables)) {
    try {
      const exists = await dbExists(conn, dbName);
      if (exists) {
        skip(dbName);
      } else {
        await conn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        ok(`Created database: ${dbName}`);
      }
    } catch (e) {
      err(`Failed to create database ${dbName}`, e);
    }
  }

  for (const [dbName, tableDefs] of Object.entries(tables)) {
    console.log(`\n  Tables in \`${dbName}\`:`);
    try {
      await conn.query(`USE \`${dbName}\``);
    } catch (e) {
      err(`Could not USE ${dbName}`, e);
      continue;
    }

    for (const { name, sql } of tableDefs) {
      try {
        const exists = await tableExists(conn, dbName, name);
        if (exists) {
          skip(name);
          await syncColumns(conn, dbName, name, sql);
          await syncEnums(conn, dbName, name, sql);
        } else {
          await conn.query(sql);
          ok(`Created table: ${name}`);
        }
      } catch (e) {
        err(`Failed to create table ${name}`, e);
      }
    }
  }

  await conn.end();
  console.log('\n──────────────────────────────────────────');
  console.log('  Initialisation complete.');
  console.log('──────────────────────────────────────────\n');
}

module.exports = initDatabases;
module.exports.tableMap = tableMap;
module.exports.dbNames = dbNames;
