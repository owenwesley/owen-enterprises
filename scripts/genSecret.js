// npm run secret  ->  prints a fresh random JWT_SECRET line to paste into .env
console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('base64url'));
