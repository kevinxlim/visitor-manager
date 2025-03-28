const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const net = require('net');
const path = require('path');
const twilio = require('twilio');
const axios = require('axios'); // Added for Teams webhook
const Visitor = require('./models/Visitor');
const Staff = require('./models/Staff');

const app = express();
const PORT = 3001;

// Printer Configuration
//const PRINTER_IP = '';
//const PRINTER_PORT = ;

// Twilio Configuration
//const TWILIO_ACCOUNT_SID = '';
//const TWILIO_AUTH_TOKEN = '';
//const TWILIO_PHONE_NUMBER = '';
//const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Teams Workflow Webhook URL (replace with your actual URL)
//const TEAMS_WEBHOOK_URL = '';

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// MongoDB Connection
const mongoURI = 'mongodb://localhost:27017/visitor_signin_atwc';
mongoose.connect(mongoURI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Email Configuration
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: '',
    pass: ''
  }
});

function printNameTag(name, company, staffMember) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const labelData = Buffer.from(`${name}\r\n${company}\r\nVisiting: ${staffMember}\r\n`);
    const commands = Buffer.concat([
      Buffer.from([0x1B, 0x40]), // ESC @ (Initialize)
      labelData,
      Buffer.from([0x0C]) // Form Feed
    ]);

    client.connect(PRINTER_PORT, PRINTER_IP, () => {
      console.log(`Connected to printer at ${PRINTER_IP}:${PRINTER_PORT}`);
      client.write(commands);
      setTimeout(() => client.end(), 1000);
    });

    client.on('error', reject);
    client.on('close', () => {
      console.log('Printer connection closed');
      resolve();
    });
  });
}

async function sendSMS(toPhoneNumber, message) {
  try {
    const result = await client.messages.create({
      body: message,
      from: TWILIO_PHONE_NUMBER,
      to: toPhoneNumber
    });
    console.log('SMS sent:', result.sid);
  } catch (err) {
    console.error('SMS error:', err);
  }
}

async function sendTeamsNotification(name, company, staff_member, purpose, visitor_id) {
  try {
    const payload = {
      text: `Visitor: ${name}\nCompany: ${company}\nVisiting: ${staff_member}\nPurpose: ${purpose || 'Not specified'}\nID: ${visitor_id}`
    };
    const response = await axios.post(TEAMS_WEBHOOK_URL, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('Teams notification sent:', response.status);
  } catch (err) {
    console.error('Teams notification error:', err.response ? err.response.data : err.message);
  }
}

async function generateShortId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id;
  let isUnique = false;

  while (!isUnique) {
    id = '';
    for (let i = 0; i < 6; i++) {
      id += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    const existing = await Visitor.findOne({ visitor_id: id });
    if (!existing) isUnique = true;
  }
  return id;
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index_main.html'));
});

app.get('/main', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index_main.html'));
});

app.get('/residential', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index_residential.html'));
});

// Shared Routes with Site Context
app.get('/:site(signin|main/signin|residential/signin)', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signin.html'));
});

app.get('/:site(health-safety|main/health-safety|residential/health-safety)', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'health_safety.html'));
});

app.get('/:site(label-preview|main/label-preview|residential/label-preview)', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'label_preview.html'));
});

app.get('/:site(signout|main/signout|residential/signout)', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signout.html'));
});

app.get('/:site(print-success|main/print-success|residential/print-success)', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'print_success.html'));
});

app.get('/visitor-logs', async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = {};

    if (start || end) {
      query._id = {};
      if (start) query._id.$gte = new Date(start);
      if (end) {
        const endDate = new Date(end);
        endDate.setDate(endDate.getDate() + 1);
        query._id.$lt = endDate;
      }
    }

    const visitors = await Visitor.find(query).sort({ _id: -1 });
    res.json(visitors.map(v => ({
      id: v.visitor_id,
      name: v.name,
      company: v.company,
      purpose: v.purpose_of_visit || '',
      staff_member: v.staff_member,
      site: v.site,
      sign_in_time: v._id.getTimestamp(),
      departure_time: v.departure_time || 'Still Present'
    })));
  } catch (err) {
    console.error('Error fetching visitor logs:', err);
    res.status(500).send('Error fetching visitor logs');
  }
});

app.get('/:site(visitor-logs-page|main/visitor-logs-page|residential/visitor-logs-page)', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'visitor_logs.html'));
});

// Replace the existing visitor-logs route with this:
app.get('/:site(visitor-logs|main/visitor-logs|residential/visitor-logs)', async (req, res) => {
  try {
    // Remove site filtering entirely to fetch all visitors
    const { start, end } = req.query;
    let query = {};

    if (start || end) {
      query._id = {};
      if (start) query._id.$gte = new Date(start);
      if (end) {
        const endDate = new Date(end);
        endDate.setDate(endDate.getDate() + 1);
        query._id.$lt = endDate;
      }
    }

    const visitors = await Visitor.find(query).sort({ _id: -1 });
    res.json(visitors.map(v => ({
      id: v.visitor_id,
      name: v.name,
      company: v.company,
      purpose: v.purpose_of_visit || '',
      staff_member: v.staff_member,
      site: v.site, // Still include site in the response for display
      sign_in_time: v._id.getTimestamp(),
      departure_time: v.departure_time || 'Still Present'
    })));
  } catch (err) {
    console.error('Error fetching visitor logs:', err);
    res.status(500).send('Error fetching visitor logs');
  }
});

app.post('/submit-details', async (req, res) => {
  const { name, company, staff_member, purpose, site } = req.body; // Add site to request body
  const visitorId = await generateShortId();
  try {
    const staff = await Staff.findOne({ name: staff_member });
    if (!staff) return res.status(400).send('Staff member not found');
    res.redirect(`/health-safety?name=${encodeURIComponent(name)}&company=${encodeURIComponent(company)}&staff_member=${encodeURIComponent(staff_member)}&purpose=${encodeURIComponent(purpose || '')}&visitor_id=${visitorId}&site=${encodeURIComponent(site)}`);
  } catch (err) {
    console.error('Error in /submit-details:', err);
    res.status(500).send('Error during sign-in');
  }
});

app.post('/accept-safety', async (req, res) => {
  const { name, company, purpose, staff_member, visitor_id, site } = req.body;
  try {
    const staff = await Staff.findOne({ name: staff_member });
    if (!staff) return res.status(400).send('Staff member not found');
    res.redirect(`/label-preview?name=${encodeURIComponent(name)}&company=${encodeURIComponent(company)}&staff_member=${encodeURIComponent(staff_member)}&purpose=${encodeURIComponent(purpose || '')}&visitor_id=${visitor_id}&site=${encodeURIComponent(site)}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error during sign-in');
  }
});

app.post('/print-label', async (req, res) => {
  const { name, company, purpose, staff_member, visitor_id, site } = req.body;
  try {
    const staff = await Staff.findOne({ name: staff_member });
    if (!staff) return res.status(400).send('Staff member not found');

    console.log('Print-label received data:', { name, company, purpose, staff_member, visitor_id, site });
    const visitor = new Visitor({
      visitor_id,
      name,
      company,
      purpose_of_visit: purpose || '',
      staff_member,
      site,
      sign_in_time: new Date()
    });
    await visitor.save();
    console.log('Visitor saved to database:', visitor.toObject());

    const messageText = `Visitor: ${name}\nCompany: ${company}\nVisiting: ${staff_member}\nPurpose: ${purpose || 'Not specified'}\nID: ${visitor_id}`;
    const mailOptions = {
      from: 'k84215784@gmail.com',
      to: staff.email,
      subject: 'New Visitor Arrival',
      text: messageText
    };
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) console.error('Email error:', error);
      else console.log('Email sent:', info.response);
    });

    const sitePrefix = site === 'Residential Area' ? 'residential' : 'main';
    res.redirect(`/${sitePrefix}/print-success?name=${encodeURIComponent(name)}&company=${encodeURIComponent(company)}&staff_member=${encodeURIComponent(staff_member)}&site=${encodeURIComponent(site)}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error during sign-in or printing');
  }
});

app.post('/signout', async (req, res) => {
  const { visitor_id } = req.body;
  try {
    const visitor = await Visitor.findOneAndUpdate(
      { visitor_id },
      { departure_time: new Date() },
      { new: true }
    );
    if (!visitor) return res.status(400).send('Visitor not found');
    res.send('Sign-out successful!');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error during sign-out');
  }
});

app.get('/staff', async (req, res) => {
  const staff = await Staff.find({}, 'name');
  res.json(staff.map(s => s.name));
});

app.get('/:site(active-visitors|main/active-visitors|residential/active-visitors)', async (req, res) => {
  try {
    // Extract the site from the URL path
    const pathSite = req.params.site.split('/')[0]; // Get just the first part of the path
    console.log('Received request for site:', pathSite);
    
    // Map the URL path to the correct site name
    const site = pathSite === 'residential' ? 'Residential Area' : 'Main Reception';
    console.log('Mapped to site name:', site);
    
    const query = { departure_time: null, site };
    console.log('MongoDB query:', JSON.stringify(query));
    
    const visitors = await Visitor.find(query);
    console.log('Found visitors:', JSON.stringify(visitors, null, 2));
    
    // Log the full visitor objects for debugging
    visitors.forEach(v => {
      console.log('Visitor details:', {
        id: v.visitor_id,
        name: v.name,
        site: v.site,
        sign_in_time: v.sign_in_time,
        departure_time: v.departure_time
      });
    });
    
    res.json(visitors.map(v => ({
      id: v.visitor_id,
      name: v.name,
      sign_in_time: v.sign_in_time,
      site: v.site
    })));
  } catch (err) {
    console.error('Error in active-visitors endpoint:', err);
    res.status(500).send('Error fetching active visitors');
  }
});

app.get('/test-print', (req, res) => {
  printNameTag('Test User', 'Test Co', 'John Doe')
    .then(() => res.send('Print command sent'))
    .catch((err) => res.send('Print failed: ' + err.message));
});

// Start Server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));