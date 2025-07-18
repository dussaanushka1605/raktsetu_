const express = require('express');
const router = express.Router();
const Donor = require('../models/Donor');
const auth = require('../middleware/auth');
const BloodRequest = require('../models/BloodRequest');

// Get all donors
router.get('/', auth, async (req, res) => {
    try {
        const donors = await Donor.find();
        res.json(donors);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get donor profile
router.get('/profile', auth, async (req, res) => {
    try {
        const donor = await Donor.findById(req.user.userId);
        if (!donor) {
            return res.status(404).json({ message: 'Donor not found' });
        }
        res.json(donor);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update donor profile
router.patch('/profile', auth, async (req, res) => {
    try {
        const updates = req.body;
        const donor = await Donor.findById(req.user.userId);
        
        if (!donor) {
            return res.status(404).json({ message: 'Donor not found' });
        }

        Object.keys(updates).forEach(update => {
            if (update !== 'password') { // Don't allow password updates through this route
                donor[update] = updates[update];
            }
        });

        await donor.save();
        res.json(donor);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update availability status
router.patch('/availability', auth, async (req, res) => {
    try {
        const donor = await Donor.findById(req.user.userId);
        if (!donor) {
            return res.status(404).json({ message: 'Donor not found' });
        }

        donor.isAvailable = req.body.isAvailable;
        await donor.save();
        
        res.json({ message: 'Availability updated successfully', donor });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update last donation date
router.patch('/last-donation', auth, async (req, res) => {
    try {
        const donor = await Donor.findById(req.user.userId);
        if (!donor) {
            return res.status(404).json({ message: 'Donor not found' });
        }

        donor.lastDonation = new Date(req.body.lastDonation);
        await donor.save();
        
        res.json({ message: 'Last donation date updated successfully', donor });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Get blood requests for donor
router.get('/blood-requests', auth, async (req, res) => {
  try {
    // Get donor's blood type
    const donor = await Donor.findById(req.user.userId);
    if (!donor) {
      return res.status(404).json({ message: 'Donor not found' });
    }

    // Find all blood requests where:
    // 1. Donor is in the notifiedDonors array
    // 2. Blood type matches donor's blood group (optional, but keep for compatibility)
    const bloodRequests = await BloodRequest.find({
      bloodType: donor.bloodGroup,
      notifiedDonors: donor._id
    })
    .populate('hospitalId', 'name email phone city state')
    .sort({ createdAt: -1 });

    // Format the response, including donor's response (if any)
    const formattedRequests = bloodRequests.map(request => {
      // Find this donor's response if present
      const donorResponse = request.donorResponses.find(r => r.donor.equals(donor._id));
      return {
        _id: request._id,
        hospitalId: request.hospitalId._id,
        hospitalName: request.hospitalId.name,
        hospitalEmail: request.hospitalId.email,
        hospitalPhone: request.hospitalId.phone,
        hospitalLocation: `${request.hospitalId.city}, ${request.hospitalId.state}`,
        bloodType: request.bloodType,
        contactPerson: request.contactPerson,
        contactNumber: request.contactNumber,
        urgent: request.urgent,
        status: request.status,
        notifiedDonors: request.notifiedDonors,
        donorResponses: request.donorResponses,
        donorResponse: donorResponse ? {
          response: donorResponse.response,
          respondedAt: donorResponse.respondedAt
        } : null,
        acceptedBy: request.acceptedBy,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt
      };
    });

    res.json(formattedRequests);
  } catch (error) {
    console.error('Error fetching blood requests:', error);
    res.status(500).json({ message: error.message });
  }
});

// Respond to a blood request
router.post('/blood-requests/:requestId/respond', auth, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { response } = req.body;

    if (!['accepted', 'rejected'].includes(response)) {
      return res.status(400).json({ message: 'Invalid response type' });
    }

    const donor = await Donor.findById(req.user.userId);
    if (!donor) {
      return res.status(404).json({ message: 'Donor not found' });
    }

    const bloodRequest = await BloodRequest.findById(requestId);
    if (!bloodRequest) {
      return res.status(404).json({ message: 'Blood request not found' });
    }

    // Check if donor is notified for this request
    if (!bloodRequest.notifiedDonors.includes(donor._id)) {
      return res.status(403).json({ message: 'Not authorized to respond to this request' });
    }

    // Check if request is still pending
    if (bloodRequest.status !== 'pending') {
      return res.status(400).json({ message: 'This request is no longer pending' });
    }

    // Check if donor hasn't already responded
    if (bloodRequest.donorResponses.some(r => r.donor.equals(donor._id))) {
      return res.status(400).json({ message: 'You have already responded to this request' });
    }

    // Add donor's response
    bloodRequest.donorResponses.push({
      donor: donor._id,
      response,
      respondedAt: new Date()
    });

    // If donor accepted, update request status and acceptedBy
    if (response === 'accepted') {
      bloodRequest.status = 'accepted';
      bloodRequest.acceptedBy = donor._id;
    }

    await bloodRequest.save();

    // If accepted, return full request details
    if (response === 'accepted') {
      const populatedRequest = await BloodRequest.findById(requestId)
        .populate('hospitalId', 'name email contactNumber city state')
        .populate('acceptedBy', 'name email phone');

      return res.json({
        message: 'Request accepted successfully',
        request: populatedRequest
      });
    }

    res.json({ message: 'Response recorded successfully' });
  } catch (error) {
    console.error('Error responding to blood request:', error);
    res.status(500).json({ message: 'Error responding to blood request' });
  }
});

module.exports = router; 