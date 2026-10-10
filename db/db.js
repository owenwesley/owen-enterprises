/**
 * db/db.js
 *
 * Creates each connection pool and — immediately after connecting —
 * checks that the database and its tables exist, creating them if not.
 * No external init script required; everything is self-contained here.
 *
 * Pool layout:
 *   owenenterprises  →  users, feature_preferences
 *   bgtracker        →  readings, bloodpressures, medications,
 *                        weights, nutritions, preferences, books, movies
 *   meetings         →  meetings          (own pool; own DB if configured)
 *   church           →  churches, members, announcements (own pool; DB_CHURCH, default `church`)
 */

const mysql = require('mysql2');
const dotenv = require('dotenv');

dotenv.config();

const BASE = {
  host:               process.env.DB_HOST || 'localhost',
  user:               process.env.DB_USER || 'root',
  password:           process.env.DB_PASS || '',
  port:               Number(process.env.DB_PORT) || 3306,
  multipleStatements: true,
};

const TABLES = {

  owenenterprises: [
    {
      name: 'users',
      sql: `CREATE TABLE IF NOT EXISTS users (
        id        INT          AUTO_INCREMENT PRIMARY KEY,
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
        id                  INT        AUTO_INCREMENT PRIMARY KEY,
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

  bgtracker: [
    {
      name: 'readings',
      sql: `CREATE TABLE IF NOT EXISTS readings (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        user_id     INT NOT NULL,
        date        TEXT NOT NULL,
        sugarB      INT NOT NULL, carbsB      INT NOT NULL,
        insulinSB   INT NOT NULL,
        insulinFB   INT NOT NULL, chkMedsB    TINYINT(1) NOT NULL,
        sugarL      INT NOT NULL, carbsL      INT NOT NULL,
        insulinL    INT NOT NULL, chkMedsL    TINYINT(1) NOT NULL,
        sugarD      INT NOT NULL, carbsD      INT NOT NULL,
        insulinD    INT NOT NULL, chkMedsD    TINYINT(1) NOT NULL,
        sugarBB     INT NOT NULL, carbsBB     INT NOT NULL, insulinBB   INT NOT NULL,
        sugarBed    INT NOT NULL, carbsBed    INT NOT NULL,
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

  communitylibrary: [
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

  // meetings table lives with the meetings pool —
  // if DB_MEETINGS points to a separate database it will be created there
  meetings: [
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

  church: [
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
        status       ENUM('pending','accepted','declined','cancelled','expired') NOT NULL DEFAULT 'pending',
        createdAt    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        answeredAt   TIMESTAMP NULL DEFAULT NULL,
        auto         TINYINT(1) NOT NULL DEFAULT 0,
        hideOwner    TINYINT(1) NOT NULL DEFAULT 0,
        hideRequester TINYINT(1) NOT NULL DEFAULT 0,
        KEY idx_owner (user_id, status),
        KEY idx_requester (requester_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    },
  ],
};

function ensureDatabase(dbName, callback) {
  const conn = mysql.createConnection(BASE);
  conn.connect((connErr) => {
    if (connErr) {
      console.error(`  ✗ Cannot connect to MySQL for ${dbName}:`, connErr.message);
      conn.destroy();
      return callback(connErr);
    }
    conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      (dbErr) => {
        conn.destroy();
        if (dbErr) {
          console.error(`  ✗ Could not create database ${dbName}:`, dbErr.message);
          return callback(dbErr);
        }
        callback(null);
      }
    );
  });
}

function ensureTables(pool, tableDefs, label) {
  pool.getConnection((poolErr, conn) => {
    if (poolErr) {
      console.error(`  ✗ ${label} pool connection failed:`, poolErr.message);
      return;
    }

    let i = 0;
    function next() {
      if (i >= tableDefs.length) {
        conn.release();
        return;
      }
      const { name, sql } = tableDefs[i++];
      conn.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [name],
        (checkErr, rows) => {
          if (checkErr) {
            console.error(`  ✗ ${label}.${name} check failed:`, checkErr.message);
            return next();
          }
          if (rows.length > 0) {
            console.log(`  –  ${label}.${name} (exists)`);
            return next();
          }
          conn.query(sql, (createErr) => {
            if (createErr) {
              console.error(`  ✗ ${label}.${name} create failed:`, createErr.message);
            } else {
              console.log(`  ✓  ${label}.${name} created`);
            }
            next();
          });
        }
      );
    }
    next();
  });
}

function makePool(envVar, defaultDb, label, tableDefs) {
  const dbName = process.env[envVar] || defaultDb;
  const pool = mysql.createPool({ ...BASE, database: dbName });
  ensureDatabase(dbName, (err) => {
    if (err) return;
    console.log(`\n  ${label} → ${dbName}`);
    ensureTables(pool, tableDefs, label);
  });
  return pool;
}

console.log('\n══════════════════════════════════════════');
console.log('  OwenEnterprises  database check');
console.log('══════════════════════════════════════════');

const owenenterprises  = makePool('DB_GATEWAY',         'owenenterprises', 'owenenterprises', TABLES.owenenterprises);
const bgtracker        = makePool('DB_BGTRACKER',        'bgtracker',       'bgtracker',       TABLES.bgtracker);
const communitylibrary = makePool('DB_COMMUNITYLIBRARY', 'communitylibrary','communitylibrary', TABLES.communitylibrary);
const meetings         = makePool('DB_MEETINGS',         'meetings',        'meetings',         TABLES.meetings);
const church           = makePool('DB_CHURCH',           'church',          'church',           TABLES.church);

module.exports = { owenenterprises, bgtracker, communitylibrary, meetings, church };
