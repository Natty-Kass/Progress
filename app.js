const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables

const app = express();

// Configure Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Middleware to parse form data
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/gallery', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'gallery.html'));
});
app.get('/choose', checkDatabaseMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'choose.html'));
});
app.get('/choose/highschool', checkDatabaseMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Register.html'));
});
app.get('/choose/elementary', checkDatabaseMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ERegister.html'));
});
app.get('/success', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'success.html'));
});
app.get('/error', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'error.html'));
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post('/send-message', (req, res) => {
    console.log('Request Body:', req.body); // Log the request body for debugging
    const { fullName, email, message } = req.body;

    const mailOptions = {
        from: email, // Sender address
        to: process.env.EMAIL_USER, // Your email address
        subject: 'New Contact Us Message',
        text: `Name: ${fullName}\nEmail: ${email}\nMessage:\n${message}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
            res.status(500).send('Failed to send message.');
        } else {
            console.log('Email sent:', info.response);
            res.status(200).sendFile(path.join(__dirname, 'public', 'contact_form_success.html'));
        }
    });
});


// MySQL database connections
const highSchoolDbConfig = {
    host: process.env.HIGH_SCHOOL_DB_HOST,
    user: process.env.HIGH_SCHOOL_DB_USER,
    password: process.env.HIGH_SCHOOL_DB_PASSWORD,
    database: process.env.HIGH_SCHOOL_DB_NAME
};

const elementaryDbConfig = {
    host: process.env.ELEMENTARY_DB_HOST,
    user: process.env.ELEMENTARY_DB_USER,
    password: process.env.ELEMENTARY_DB_PASSWORD,
    database: process.env.ELEMENTARY_DB_NAME
};

let highSchoolDb = mysql.createConnection(highSchoolDbConfig);
let elementaryDb = mysql.createConnection(elementaryDbConfig);

function connectDb(db, config, dbName) {
    db.connect((err) => {
        if (err) {
            console.error(`Error connecting to the ${dbName} database:`, err.stack);
        } else {
            console.log(`Connected to the ${dbName} database.`);
        }
    });

    // Handle disconnections
    db.on('error', (err) => {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.error(`Connection to ${dbName} database lost, reconnecting...`);
            setTimeout(() => connectDb(db, config, dbName), 10000); // Try to reconnect after 2 seconds
        } else {
            throw err;
        }
    });
}

// Initially connect to databases
connectDb(highSchoolDb, highSchoolDbConfig, 'high school');
connectDb(elementaryDb, elementaryDbConfig, 'elementary');


// Function to check grade capacity
function checkGradeCapacity(db, gradeId, callback) {
    const query = 'SELECT max_capacity, current_enrollment FROM grades WHERE grade_id = ?';
    db.query(query, [gradeId], (err, results) => {
        if (err) {
            console.error('Error querying grade capacity:', err.stack);
            callback(err);
            return;
        }
        if (results.length === 0) {
            callback(new Error('Grade not found'));
            return;
        }
        const { max_capacity, current_enrollment } = results[0];
        callback(null, current_enrollment >= max_capacity);
    });
}

// Function to update enrollment count
function updateEnrollmentCount(db, gradeId, callback) {
    const query = 'UPDATE grades SET current_enrollment = current_enrollment + 1 WHERE grade_id = ?';
    db.query(query, [gradeId], (err) => {
        if (err) {
            console.error('Error updating enrollment count:', err.stack);
            callback(err);
            return;
        }
        callback(null);
    });
}

// Function to check database connectivity
function checkDatabaseStatus(callback) {
    highSchoolDb.query('SELECT 1', (err) => {
        if (err) {
            console.error('High School Database is down:', err);
            callback(false); // Database is down
        } else {
            elementaryDb.query('SELECT 1', (err) => {
                if (err) {
                    console.error('Elementary Database is down:', err);
                    callback(false); // Database is down
                } else {
                    callback(true); // Both databases are up
                }
            });
        }
    });
}

// Middleware to check database status
function checkDatabaseMiddleware(req, res, next) {
    checkDatabaseStatus((isUp) => {
        if (isUp) {
            next(); // Proceed to the route handler
        } else {
            res.sendFile(path.join(__dirname, 'public', 'reason.html')); // Show reason.html if DB is down
        }
    });
}


// Route to check registration
app.get('/check-registration', (req, res) => {
    checkDatabaseStatus((isUp) => {
        if (isUp) {
            res.redirect('/choose');
        } else {
            res.sendFile(path.join(__dirname, 'public', 'reason.html'));
        }
    });
});

// File upload configuration using multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'C:/temp_uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage }).fields([
    { name: 'studentPhoto', maxCount: 1 },
    { name: 'birthCertificate', maxCount: 1 },
    { name: 'previousSchool', maxCount: 1 }
]);

// Route to handle high school form submission
app.post('/register/highschool', checkDatabaseMiddleware, upload, (req, res) => {
    console.log('High School Request Body:', req.body);
    console.log('High School Request Files:', req.files);

    const {
        firstName,
        middleName,
        lastName,
        dob,
        gender,
        grade,
        fatherPhone: fatherPhoneNumber,
        motherPhone: motherPhoneNumber,
        address,
        email: emailAddress,
        emergencyContact: emergencyContactName,
        emergencyPhone: emergencyContactPhone,
        contactMethod,
        healthStatus,
        previousSchoolCertificate = 'N/A',
        department = departmentSelection = 'N/A', // Ensure this matches the table column name
        telegramUsername,
        phoneNumber,
        contactEmail
    } = req.body;

    let selectedTelegramUsername = null;
    let selectedPhoneNumber = null;
    let selectedContactEmail = null;

    if (contactMethod === 'Telegram') {
        selectedTelegramUsername = telegramUsername;
    } else if (contactMethod === 'Phone') {
        selectedPhoneNumber = phoneNumber;
    } else if (contactMethod === 'Email') {
        selectedContactEmail = contactEmail;
    }

    const studentFolder = path.join('C:/student_images/', `${firstName}_${middleName}_${lastName}`);
    if (!fs.existsSync(studentFolder)) {
        fs.mkdirSync(studentFolder, { recursive: true });
    }

    const moveFile = (file) => {
        const tempPath = path.join('C:/temp_uploads/', file.filename);
        const destPath = path.join(studentFolder, file.filename);
        if (fs.existsSync(tempPath)) {
            fs.renameSync(tempPath, destPath);
            return file.filename;
        } else {
            console.error('File does not exist:', tempPath);
            return null;
        }
    };

    const studentPhoto = req.files['studentPhoto'] ? moveFile(req.files['studentPhoto'][0]) : null;
    const birthCertificate = req.files['birthCertificate'] ? moveFile(req.files['birthCertificate'][0]) : null;
    const previousSchool = req.files['previousSchool'] ? moveFile(req.files['previousSchool'][0]) : 'N/A';

    // Check grade capacity
    checkGradeCapacity(highSchoolDb, grade, (err, isFull) => {
        if (err) {
            console.error('Error checking grade capacity:', err.stack);
            res.status(500).sendFile(path.join(__dirname, 'public', 'error.html'));
            return;
        }
        if (isFull) {
            res.status(200).sendFile(path.join(__dirname, 'public', 'registration_closed.html'));
            return;
        }

        // Update enrollment count and insert student data
        updateEnrollmentCount(highSchoolDb, grade, (err) => {
            if (err) {
                console.error('Error updating enrollment count:', err.stack);
                res.status(500).sendFile(path.join(__dirname, 'public', 'error.html'));
                return;
            }

            const query = `
            INSERT INTO high_school_students (
                first_name, middle_name, last_name, date_of_birth, gender, birth_certificate, 
                student_photo, grade_id, father_phone_number, mother_phone_number, address, 
                email_address, emergency_contact_name, emergency_contact_phone, contact_method,
                telegram_username, phone_number, contact_email, health_status, previous_school_certificate, department_selection
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `;

            highSchoolDb.query(query, [
                firstName, middleName, lastName, dob, gender, birthCertificate, 
                studentPhoto, grade, fatherPhoneNumber, motherPhoneNumber, 
                address, emailAddress, emergencyContactName, emergencyContactPhone, 
                contactMethod, selectedTelegramUsername, selectedPhoneNumber, selectedContactEmail, 
                healthStatus, previousSchool, department
            ], (err, result) => {
                if (err) {
                    console.error('Error inserting data into high school database:', err.stack);
                    res.status(500).sendFile(path.join(__dirname, 'public', 'error.html'));
                } else {
                    res.status(200).sendFile(path.join(__dirname, 'public', 'success.html'));
                }
            });
        });
    });
});


// Route to handle elementary form submission
app.post('/register/elementary', checkDatabaseMiddleware, upload, (req, res) => {
    console.log('Elementary Request Body:', req.body);
    console.log('Elementary Request Files:', req.files);

    const {
        firstName,
        middleName,
        lastName,
        dob,
        gender,
        grade,
        fatherPhone: fatherPhoneNumber,
        motherPhone: motherPhoneNumber,
        address,
        email: emailAddress,
        emergencyContact: emergencyContactName,
        emergencyPhone: emergencyContactPhone,
        contactMethod,
        healthStatus,
        previousSchoolCertificate = 'N/A',
        telegramUsername,
        phoneNumber,
        contactEmail
    } = req.body;

    let selectedTelegramUsername = null;
    let selectedPhoneNumber = null;
    let selectedContactEmail = null;

    if (contactMethod === 'Telegram') {
        selectedTelegramUsername = telegramUsername;
    } else if (contactMethod === 'Phone') {
        selectedPhoneNumber = phoneNumber;
    } else if (contactMethod === 'Email') {
        selectedContactEmail = contactEmail;
    }

    const studentFolder = path.join('C:/EStudent_images/', `${firstName}_${middleName}_${lastName}`);
    if (!fs.existsSync(studentFolder)) {
        fs.mkdirSync(studentFolder, { recursive: true });
    }

    const moveFile = (file) => {
        const tempPath = path.join('C:/temp_uploads/', file.filename);
        const destPath = path.join(studentFolder, file.filename);
        if (fs.existsSync(tempPath)) {
            fs.renameSync(tempPath, destPath);
            return file.filename;
        } else {
            console.error('File does not exist:', tempPath);
            return null;
        }
    };

    const studentPhoto = req.files['studentPhoto'] ? moveFile(req.files['studentPhoto'][0]) : null;
    const birthCertificate = req.files['birthCertificate'] ? moveFile(req.files['birthCertificate'][0]) : null;
    const previousSchool = req.files['previousSchool'] ? moveFile(req.files['previousSchool'][0]) : 'N/A';

    // Check grade capacity
    checkGradeCapacity(elementaryDb, grade, (err, isFull) => {
        if (err) {
            console.error('Error checking grade capacity:', err.stack);
            res.status(500).sendFile(path.join(__dirname, 'public', 'error.html'));
            return;
        }
        if (isFull) {
            res.status(200).sendFile(path.join(__dirname, 'public', 'registration_closed.html'));
            return;
        }

        // Update enrollment count and insert student data
        updateEnrollmentCount(elementaryDb, grade, (err) => {
            if (err) {
                console.error('Error updating enrollment count:', err.stack);
                res.status(500).sendFile(path.join(__dirname, 'public', 'error.html'));
                return;
            }

            const query = `
                INSERT INTO elementary_students (
                    first_name, middle_name, last_name, date_of_birth, gender, birth_certificate, 
                    student_photo, grade_id, father_phone_number, mother_phone_number, address, 
                    email_address, emergency_contact_name, emergency_contact_phone, contact_method,
                    telegram_username, phone_number, contact_email, health_status, previous_school_certificate
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;

            elementaryDb.query(query, [
                firstName, middleName, lastName, dob, gender, birthCertificate, 
                studentPhoto, grade, fatherPhoneNumber, motherPhoneNumber, 
                address, emailAddress, emergencyContactName, emergencyContactPhone, 
                contactMethod, selectedTelegramUsername, selectedPhoneNumber, selectedContactEmail, 
                healthStatus, previousSchool
            ], (err, result) => {
                if (err) {
                    console.error('Error inserting data into elementary database:', err.stack);
                    res.status(500).sendFile(path.join(__dirname, 'public', 'error.html'));
                } else {
                    res.status(200).sendFile(path.join(__dirname, 'public', 'success.html'));
                }
            });
        });
    });
});



// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.message);
    res.status(400).send('An error occurred');
});

// Start the Express server
app.listen(3000, () => {
    console.log('Server running on port 3000');
});


