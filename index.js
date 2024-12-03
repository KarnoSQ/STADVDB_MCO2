
const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// MySQL Connections to Nodes
const node1 = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: 'G@be060506',
  database: 'games'
});

const node2 = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: 'G@be060506',
  database: 'games2'
});

const node3 = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: 'G@be060506',
  database: 'games3'
});

app.get('/case1', async (req, res) => {
  try {
    const [node1Data] = await node1.query('SELECT p.publisher FROM Games_Publishers p JOIN Games_Details d ON p.publisherID = d.publisherID WHERE p.publisher != "N/A" GROUP BY p.publisherID HAVING COUNT(d.appID) > 5;');
    const [node2Data] = await node2.query('SELECT p.publisher FROM Games_Publishers p JOIN Games_Details d ON p.publisherID = d.publisherID WHERE p.publisher != "N/A" GROUP BY p.publisherID HAVING COUNT(d.appID) > 5;');

    res.json({
      case: 'Concurrent Reads',
      node1: node1Data,
      node2: node2Data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/case2', async (req, res) => {
  const { newValue } = "New Title";

  try {
    const connection = await node1.getConnection();
    await connection.beginTransaction();

    await connection.query('UPDATE Games_Details SET name = "New Title" WHERE appID = 20200', [newValue]);

    const [readResult] = await node1.query('SELECT * FROM Games_Details WHERE appID = 20200');

    await connection.commit();
    connection.release();

    res.json({
      case: 'Read and Write',
      write: 'Write completed',
      read: readResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/case3', async (req, res) => {
  const { value1 } = 20.00;

  try {
    const connection1 = await node1.getConnection();
    const connection2 = await node2.getConnection();

    await connection1.beginTransaction();
    await connection2.beginTransaction();

 
    await connection1.query('UPDATE Games_Details SET price = 20.00 WHERE appID = 20200', [value1]);
    await connection2.query('UPDATE Games_Details SET price = 20.00 WHERE appID = 20200', [value1]);

    await connection1.commit();
    await connection2.commit();

    connection1.release();
    connection2.release();

    res.json({
      case: 'Concurrent Writes',
      message: 'Both writes completed'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

var server = app.listen(3000, () => {
    console.log(`Server is running on http://localhost:3000`);
});