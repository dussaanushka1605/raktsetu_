const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Donor = require('../models/Donor');
const Hospital = require('../models/Hospital');
const Admin = require('../models/Admin');
const History = require('../models/History');
const auth = require('../middleware/auth');

// Register Admin (This should be used only once to create the first admin)
router.post('/register/admin', async (req, res) => {
    try {
        // Check if admin already exists
        const adminExists = await Admin.findOne({});
        if (adminExists) {
            return res.status(400).json({ message: 'Admin already exists' });
        }

        const admin = new Admin(req.body);
        await admin.save();
        // Create history record for registration
        await History.create({
            userId: admin._id,
            userType: 'Admin',
            action: 'register',
            details: { email: admin.email },
            date: new Date()
        });
        const token = jwt.sign(
            { userId: admin._id, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.status(201).json({ admin, token });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Register Donor
router.post('/register/donor', async (req, res) => {
    try {
        const { password, ...otherData } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        // Validate age
        if (otherData.age < 18 || otherData.age > 65) {
            return res.status(400).json({ message: 'Age must be between 18 and 65 years' });
        }
        // Validate gender
        if (!['Male', 'Female', 'Other'].includes(otherData.gender)) {
            return res.status(400).json({ message: 'Invalid gender value' });
        }
        const donor = new Donor({
            ...otherData,
            password: hashedPassword
        });
        await donor.save();
        // Create history record for registration
        await History.create({
            userId: donor._id,
            userType: 'Donor',
            action: 'register',
            details: { email: donor.email },
            date: new Date()
        });
        const token = jwt.sign(
            { userId: donor._id, role: 'donor' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.status(201).json({ donor, token });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Register Hospital
router.post('/register/hospital', async (req, res) => {
    try {
        const { 
            name, 
            email, 
            password, 
            phone, 
            city, 
            state, 
            contactPerson, 
            licenseNumber 
        } = req.body;
        console.log('Registration attempt:', {
            email,
            passwordLength: password?.length
        });
        // Validate required fields
        const missingFields = [];
        if (!name) missingFields.push('name');
        if (!email) missingFields.push('email');
        if (!password) missingFields.push('password');
        if (!phone) missingFields.push('phone');
        if (!city) missingFields.push('city');
        if (!state) missingFields.push('state');
        if (!contactPerson) missingFields.push('contact person');
        if (!licenseNumber) missingFields.push('license number');
        if (missingFields.length > 0) {
            return res.status(400).json({ 
                message: `Missing required fields: ${missingFields.join(', ')}`
            });
        }
        // Check if email already exists
        const existingHospital = await Hospital.findOne({ email: email.toLowerCase() });
        if (existingHospital) {
            return res.status(400).json({ 
                message: 'Email already registered'
            });
        }
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        console.log('Password hashed during registration');
        // Create new hospital instance
        const hospital = new Hospital({
            name,
            email: email.toLowerCase(),
            password: hashedPassword, // Use the hashed password
            phone,
            city,
            state,
            contactPerson: contactPerson.trim(),
            licenseNumber,
            isVerified: false
        });
        // Save to database
        await hospital.save();
        // Create history record for registration
        await History.create({
            userId: hospital._id,
            userType: 'Hospital',
            action: 'register',
            details: { email: hospital.email },
            date: new Date()
        });
        console.log('Hospital saved with hashed password');
        // Generate token
        const token = jwt.sign(
            { userId: hospital._id, role: 'hospital' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.status(201).json({ 
            message: 'Hospital registration successful. Waiting for admin verification.',
            hospital: {
                id: hospital._id,
                name: hospital.name,
                email: hospital.email,
                isVerified: hospital.isVerified
            },
            token
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(400).json({ 
            message: error.message || 'Registration failed'
        });
    }
});

// Login Admin
router.post('/login/admin', async (req, res) => {
    try {
        const { email, password } = req.body;
        // Normalize email to lowercase and trim spaces
        const normalizedEmail = email.trim().toLowerCase();
        const admin = await Admin.findOne({ email: normalizedEmail });
        
        if (!admin || !(await bcrypt.compare(password, admin.password))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        // Update lastLogin
        admin.lastLogin = new Date();
        await admin.save();
        // Create history record
        await History.create({
            userId: admin._id,
            userType: 'Admin',
            action: 'login',
            details: { email: admin.email },
            date: new Date()
        });
        
        const token = jwt.sign(
            { userId: admin._id, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({ 
            admin: {
                _id: admin._id,
                name: admin.name,
                email: admin.email,
                role: 'admin',
                isVerified: true
            },
            token 
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Login Donor
router.post('/login/donor', async (req, res) => {
    try {
        const { email, password } = req.body;
        const donor = await Donor.findOne({ email });
        
        if (!donor || !(await bcrypt.compare(password, donor.password))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        // Update lastLogin
        donor.lastLogin = new Date();
        await donor.save();
        // Create history record
        await History.create({
            userId: donor._id,
            userType: 'Donor',
            action: 'login',
            details: { email: donor.email },
            date: new Date()
        });
        
        const token = jwt.sign(
            { userId: donor._id, role: 'donor' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({ donor, token });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Login Hospital
router.post('/login/hospital', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('Login attempt:', { email, passwordLength: password?.length });
        
        if (!email || !password) {
            return res.status(400).json({ 
                message: 'Email and password are required' 
            });
        }

        // Find hospital
        const hospital = await Hospital.findOne({ email: email.toLowerCase() });
        
        if (!hospital) {
            console.log('No hospital found with email:', email);
            return res.status(401).json({ 
                message: 'Invalid credentials'
            });
        }

        console.log('Found hospital:', {
            id: hospital._id,
            email: hospital.email,
            hasPassword: !!hospital.password,
            passwordPrefix: hospital.password?.substring(0, 10)
        });

        // Compare passwords
        const isValidPassword = await hospital.comparePassword(password);
        console.log('Password validation result:', isValidPassword);
        
        if (!isValidPassword) {
            return res.status(401).json({ 
                message: 'Invalid credentials'
            });
        }
        
        // Check if hospital is verified
        if (!hospital.isVerified) {
            return res.status(401).json({ 
                message: 'Your account is pending admin verification. Please wait for approval.'
            });
        }
        // Update lastLogin
        hospital.lastLogin = new Date();
        await hospital.save();
        // Create history record
        await History.create({
            userId: hospital._id,
            userType: 'Hospital',
            action: 'login',
            details: { email: hospital.email },
            date: new Date()
        });
        // Generate token
        const token = jwt.sign(
            { userId: hospital._id, role: 'hospital' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({ 
            hospital: {
                id: hospital._id,
                name: hospital.name,
                email: hospital.email,
                licenseNumber: hospital.licenseNumber,
                isVerified: hospital.isVerified,
                phone: hospital.phone,
                city: hospital.city,
                state: hospital.state,
                contactPerson: hospital.contactPerson,
                requestsMade: hospital.requestsMade,
                requestsCompleted: hospital.requestsCompleted,
                createdAt: hospital.createdAt
            }, 
            token,
            message: 'Login successful'
        });
    } catch (error) {
        console.error('Hospital login error:', error);
        res.status(400).json({ 
            message: error.message || 'Login failed'
        });
    }
});

// Reset Hospital Password
router.post('/reset-password/hospital', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        
        if (!email || !newPassword) {
            return res.status(400).json({ 
                message: 'Email and new password are required' 
            });
        }

        // Convert email to lowercase for case-insensitive comparison
        const normalizedEmail = email.toLowerCase();
        
        // Find hospital
        const hospital = await Hospital.findOne({ email: normalizedEmail });
        
        if (!hospital) {
            return res.status(404).json({ 
                message: 'No hospital found with this email' 
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Update password
        hospital.password = hashedPassword;
        await hospital.save();
        
        res.json({ 
            message: 'Password reset successful',
            hospital: {
                id: hospital._id,
                email: hospital.email,
                name: hospital.name
            }
        });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(400).json({ 
            message: error.message || 'Password reset failed'
        });
    }
});

// Add logout endpoint for all user types
router.post('/logout', auth, async (req, res) => {
    try {
        let userType = req.user.role.charAt(0).toUpperCase() + req.user.role.slice(1);
        await History.create({
            userId: req.user.userId,
            userType,
            action: 'logout',
            details: { email: req.user.email },
            date: new Date()
        });
        res.json({ message: 'Logout recorded in history.' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Get current user profile
router.get('/profile', auth, async (req, res) => {
    try {
        let user;
        if (req.user.role === 'donor') {
            user = await Donor.findById(req.user.userId);
        } else if (req.user.role === 'hospital') {
            user = await Hospital.findById(req.user.userId);
        } else if (req.user.role === 'admin') {
            user = await Admin.findById(req.user.userId);
        }
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        res.json(user);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router; 