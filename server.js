const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
const dns = require('dns');

// Force Node.js to prefer IPv4 over IPv6. 
// This fixes the ENETUNREACH error on networks like Render.
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const app = express();
app.use(cors({
  origin: '*', // Allows all origins for now to fix CORS during dev
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Log incoming requests for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Nodemailer configuration
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, 
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  },
  family: 4, // Force IPv4 at the connection level
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 20000
});

// Verify transporter on start
transporter.verify(function(error, success) {
  if (error) {
    console.error('Nodemailer verification failed:', error);
  } else {
    console.log('Nodemailer is ready to send emails');
  }
});

const uri = process.env.MONGODB_URI; 

const client = new MongoClient(uri); 

let db; 

async function connectDB() {
  try {
    await client.connect();
    db = client.db();
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

app.post('/api/inquiry', async (req, res) => {
  const { name, email, msg } = req.body;

  if (!name || !email || !msg) {
    return res.status(400).json({ message: 'Missing fields' });
  }

  const mailOptions = {
    from: process.env.GMAIL_USER, 
    to: 'jmgedyyy@gmail.com', 
    subject: `OPD Inquiry from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${msg}`,
    replyTo: email               
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: 'Inquiry sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ message: 'Failed to send inquiry', error: error.message });
  }
});

// Global error handler (Must be after all routes)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
