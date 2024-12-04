
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
  password: 'password123',
  database: 'games'
});

const node2 = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: 'password123',
  database: 'window_game'
});

const node3 = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: 'password123',
  database: 'otheros_game'
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

const WAL = [];

async function checkNode(pool) {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

async function retryTransaction(pool, query, params) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await pool.query(query, params);
      return true;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
}

app.post("/rcase1", async (req, res) => {
  const query = "UPDATE Games_Details SET price = ? WHERE appID = ?";
  const params = [25.00, 20200];
  try {
    const connection = await node1.getConnection();
    const connection2 = await node2.getConnection();

    await connection.beginTransaction();
    await connection2.beginTransaction();

    const isNode1Available = await checkNode(connection);
    if (!isNode1Available) {
      await connection.commit();

      await connection2.query(query, params);
      await connection2.commit();

      connection.release();
      connection2.release();
      WAL.push({ node: 'node1', query, params });
      return res.json({ message: "Node 1 is unavailable. Press Recovery When available" });
    }
    await connection.query(query, params);
    await connection.commit();

    await connection2.query(query, params);
    await connection2.commit();
    
    connection.release();
    connection2.release();

    res.json({case: 'Master Node transaction failure ', message: "Transaction completed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/rcase2', async (req, res) => {
  const query = "UPDATE Games_Details SET price = ? WHERE appID = ?";
  const params = [30.00, 20200];

  try {
    const connection = await node1.getConnection();
    const connection2 = await node2.getConnection();

    await connection.beginTransaction();
    await connection2.beginTransaction();

    await connection.query(query, params); 

    const isNode2Available = await checkNode(node2);
    
    if (!isNode2Available) {
      WAL.push({ node: 'node2', query, params });
    } else {
      await connection2.query(query, params); 
    }
    await connection.commit();
    await connection2.commit();

    connection.release();
    connection2.release();

    res.json({ case: 'Slave Node Unavailable', message: 'Node 2 is unavailable.' });
  } catch (err) {
    res.status(500).json({ error: 'Transaction failed mid-execution.' });
  }
});

app.post('/rcase3', async (req, res) => {
  const query = "UPDATE Games_Details SET price = ? WHERE appID = ?";
  const params = [35.00, 20200];

  try {
    const connection = await node1.getConnection();
    const connection2 = await node2.getConnection();

    await connection.beginTransaction();
    await connection2.beginTransaction();

    await connection2.query(query, params);
    await connection2.commit();

    const isNode1Available = await checkNode(node1);
    if (!isNode1Available) {
      await connection.commit();
      connection.release();
      connection2.release();
      WAL.push({ node: 'node1', query, params });
      return res.json({ message: 'Node 1 is unavailable. Press Recovery When available' });
    }

    await connection.query(query, params);
    await connection.commit();
    connection.release();
    connection2.release();
    res.json({ case: 'Master Node Write Failure', message: 'Transaction completed.' });
  } catch (err) {
    res.status(500).json({ error: 'Node failed during transaction.' });
  }
});

app.post('/rcase4', async (req, res) => {
  const query = "UPDATE Games_Details SET price = ? WHERE appID = ?";
  const params = [40.00, 20200];

  try {
    const connection = await centralNode.getConnection();
    const connection2 = await centralNode.getConnection();
    await connection.beginTransaction();
    await connection2.beginTransaction();
    await connection.query(query, params); 

    const isNode2Available = await checkNode(node2);

    if (!isNode2Available) {
      await connection2.query(query, params); 

      await connection.commit();
      connection.release();

      await connection2.commit();
      connection2.release();
      WAL.push({ node: 'node2', query, params });
      return res.json({ message: 'Node 2 is unavailable. Press Recovery When available' });
    } else {
      await node2.query(query, params);
    }


    await connection.commit();
    connection.release();
    await connection2.commit();
    connection2.release();

    res.json({ case: 'Slave Nodes Write Failure', message: 'Transaction partially replicated.' });
  } catch (err) {
    res.status(500).json({ error: 'Failure during slave node writes.' });
  }
});

app.post('/recover', async (req, res) => {
  try {
    for (const txn of WAL) {
      const pool = txn.node === 'node1' ? node1 : txn.node === 'node2' ? node2 : node3;

      try {
        await retryTransaction(pool, txn.query, txn.params);
      } catch (err) {
        console.error(`Failed to recover transaction`);
      }
    }

    WAL.length = 0; // Clear the WAL after successful recovery
    res.json({ message: 'Recovery completed for all logged transactions.' });
  } catch (err) {
    res.status(500).json({ error: 'Recovery failed.' });
  }
});
app.get('/', (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

app.get('/website', (req, res) => {
  res.sendFile(__dirname + "/website.html");
});

var server = app.listen(3000, () => {
    console.log(`Server is running on http://localhost:3000`);
});