const fs = require('fs');

const key = fs.readFileSync('firebase-key.json', 'utf-8');
const jsonString = JSON.stringify(JSON.parse(key));
console.log(jsonString);
