

const mysql = require('mysql');

const express = require('express');

const app = express();

app.use(express.json());

const connection = mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'password123',
    database: 'games'
});

connection.connect((err) => {
    if(err) throw err;
    console.log("Connected to MYSQL")
})
app.get('/', (req, res) => {
    res.sendFile(__dirname + "/website.html");
});

var server = app.listen(3000, () => {
    console.log(`Server is running on http://localhost:3000`);
});