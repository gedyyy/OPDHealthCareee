const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI; 

const client = new MongoClient(uri); // <-- Remove options

let db; // <-- Declare db globally

async function connectDB() {
  try {
    await client.connect();
    db = client.db(); // <-- Assign db after connecting
    console.log('Connected to MongoDB Atlas');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}

connectDB();

app.get('/', (req, res) => {
  res.send('OPD HealthCare Backend is running!');
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await db.collection('users').find({}).toArray();
    res.json(users);
  } catch (e) { res.status(500).send(e.message); }
});

app.get('/api/queues', async (req, res) => {
  try {
    const queuesArray = await db.collection('queues').find({}).toArray();
    const queuesObj = queuesArray.reduce((acc, item) => {
      acc[item.dept] = item.entries;
      return acc;
    }, {});
    res.json(queuesObj);
  } catch (e) { res.status(500).send(e.message); }
});

app.get('/api/patients', async (req, res) => {
  try {
    const patientsArray = await db.collection('patients').find({}).toArray();
    const patientsObj = patientsArray.reduce((acc, pt) => {
      acc[pt.email] = pt;
      return acc;
    }, {});
    res.json(patientsObj);
  } catch (e) { res.status(500).send(e.message); }
});

app.get('/api/departments', async (req, res) => {
  try {
    const deptsArray = await db.collection('departments').find({}).toArray();
    const deptsObj = deptsArray.reduce((acc, dept) => {
      acc[dept.name] = { stats: dept.stats, patients: dept.patients };
      return acc;
    }, {});
    res.json(deptsObj);
  } catch (e) { res.status(500).send(e.message); }
});

app.get('/api/doctors', async (req, res) => {
  try {
    const docsArray = await db.collection('doctors').find({}).toArray();
    const docsObj = docsArray.reduce((acc, item) => {
      acc[item.dept] = item.list;
      return acc;
    }, {});
    res.json(docsObj);
  } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/users', async (req, res) => {
  try {
    const newUser = req.body;
    const existing = await db.collection('users').findOne({ email: newUser.email });
    if (existing) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    await db.collection('users').insertOne(newUser);
    res.status(201).json({ message: 'User created' });
  } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/patients', async (req, res) => {
  try {
    const patient = req.body;
    const email = patient.email;
    
    if (patient._id) delete patient._id;
    
    await db.collection('patients').updateOne(
      { email: email },
      { $set: patient },
      { upsert: true }
    );
    res.json({ message: 'Patient saved' });
  } catch (e) {
    console.error('Error saving patient:', e);
    res.status(500).send(e.message);
  }
});

app.post('/api/queues', async (req, res) => {
  try {
    const { dept, entries } = req.body;

    const cleanEntries = entries.map(e => {
      if (e._id) delete e._id;
      return e;
    });

    await db.collection('queues').updateOne(
      { dept: dept },
      { $set: { entries: cleanEntries } },
      { upsert: true }
    );
    res.json({ message: 'Queue updated' });
  } catch (e) {
    console.error('Error updating queue:', e);
    res.status(500).send(e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
