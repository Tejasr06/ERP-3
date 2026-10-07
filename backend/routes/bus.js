const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { Bus, BusRoute, Student } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');

// Sample Bangalore / Metro Coordinates for Demo Routes
const DEMO_ROUTE_1_COORDS = [
  [12.9716, 77.5946], // MG Road Metro
  [12.9750, 77.6050],
  [12.9784, 77.6408], // Indiranagar 100ft Rd
  [12.9660, 77.6480], // Domlur Flyover
  [12.9550, 77.6700], // Yamalur Junction
  [12.9560, 77.7011], // Marathahalli Bridge
  [12.9352, 77.6946], // Outer Ring Rd
  [12.9250, 77.6850], // EduConnect Campus Main Gate
];

const DEMO_ROUTE_2_COORDS = [
  [12.9279, 77.5828], // Jayanagar 4th Block
  [12.9340, 77.6100], // Dairy Circle
  [12.9352, 77.6245], // Koramangala Sony Signal
  [12.9121, 77.6446], // HSR Layout BDA Complex
  [12.9250, 77.6750], // Bellandur Green Glen
  [12.9250, 77.6850], // EduConnect Campus Main Gate
];

// Helper: seed default demo buses & routes if none exist
async function ensureDemoData() {
  if (mongoose.connection.readyState !== 1) return;
  try {
    const routeCount = await BusRoute.countDocuments();
    if (routeCount === 0) {
      const route1 = await BusRoute.create({
        routeName: 'Route 101 - North Campus Express',
        routeNumber: 'R-101',
        startPoint: 'MG Road Metro Station',
        endPoint: 'EduConnect Campus',
        stops: [
          { stopName: 'MG Road Metro', lat: 12.9716, lng: 77.5946, order: 1, scheduledTime: '07:15 AM' },
          { stopName: 'Indiranagar 100ft Junction', lat: 12.9784, lng: 77.6408, order: 2, scheduledTime: '07:30 AM' },
          { stopName: 'Domlur Flyover Stop', lat: 12.9660, lng: 77.6480, order: 3, scheduledTime: '07:45 AM' },
          { stopName: 'Marathahalli Bridge', lat: 12.9560, lng: 77.7011, order: 4, scheduledTime: '08:05 AM' },
          { stopName: 'EduConnect Campus Gate', lat: 12.9250, lng: 77.6850, order: 5, scheduledTime: '08:25 AM' },
        ],
        pathCoordinates: DEMO_ROUTE_1_COORDS,
      });

      const route2 = await BusRoute.create({
        routeName: 'Route 202 - South Corridor Express',
        routeNumber: 'R-202',
        startPoint: 'Jayanagar 4th Block',
        endPoint: 'EduConnect Campus',
        stops: [
          { stopName: 'Jayanagar 4th Block', lat: 12.9279, lng: 77.5828, order: 1, scheduledTime: '07:10 AM' },
          { stopName: 'Koramangala Sony Signal', lat: 12.9352, lng: 77.6245, order: 2, scheduledTime: '07:30 AM' },
          { stopName: 'HSR Layout BDA Complex', lat: 12.9121, lng: 77.6446, order: 3, scheduledTime: '07:50 AM' },
          { stopName: 'Bellandur Green Glen', lat: 12.9250, lng: 77.6750, order: 4, scheduledTime: '08:10 AM' },
          { stopName: 'EduConnect Campus Gate', lat: 12.9250, lng: 77.6850, order: 5, scheduledTime: '08:30 AM' },
        ],
        pathCoordinates: DEMO_ROUTE_2_COORDS,
      });

      await Bus.create({
        busNumber: 'BUS-01',
        vehicleNumber: 'KA-01-AB-1234',
        driverName: 'Ramesh Kumar',
        driverPhone: '+91 98765 43210',
        capacity: 42,
        routeId: route1._id,
        status: 'On Route',
        currentLocation: {
          lat: 12.9716,
          lng: 77.5946,
          speed: 28,
          heading: 85,
          updatedAt: new Date(),
        },
        currentStopIndex: 0,
        nextStop: 'Indiranagar 100ft Junction',
        estimatedArrival: '8:25 AM',
      });

      await Bus.create({
        busNumber: 'BUS-02',
        vehicleNumber: 'KA-01-CD-5678',
        driverName: 'Suresh Patil',
        driverPhone: '+91 98765 43211',
        capacity: 40,
        routeId: route2._id,
        status: 'Idle',
        currentLocation: {
          lat: 12.9279,
          lng: 77.5828,
          speed: 0,
          heading: 0,
          updatedAt: new Date(),
        },
        currentStopIndex: 0,
        nextStop: 'Koramangala Sony Signal',
        estimatedArrival: '8:30 AM',
      });

      console.log('✅ Demo Bus Routes & Vehicles seeded successfully');
    }
  } catch (err) {
    console.error('⚠️ Error seeding demo bus data:', err.message);
  }
}

// ── GET all buses ──────────────────────────────────────────
router.get('/buses', async (req, res) => {
  try {
    await ensureDemoData();
    const buses = await Bus.find().populate('routeId').lean();
    res.json(buses);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch buses: ' + err.message });
  }
});

// ── GET single bus by busNumber ────────────────────────────
router.get('/buses/:busNumber', async (req, res) => {
  try {
    const bus = await Bus.findOne({ busNumber: req.params.busNumber.toUpperCase() }).populate('routeId').lean();
    if (!bus) return res.status(404).json({ error: 'Bus not found' });
    res.json(bus);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bus: ' + err.message });
  }
});

// ── GET bus assigned to student ────────────────────────────
router.get('/buses/student/:studentId', async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.studentId });
    const targetBusId = student?.busId || 'BUS-01';
    let bus = await Bus.findOne({ busNumber: targetBusId }).populate('routeId').lean();
    if (!bus) {
      // Fallback to first available bus
      bus = await Bus.findOne().populate('routeId').lean();
    }
    res.json({
      bus,
      studentStop: student?.busStop || bus?.routeId?.stops?.[1]?.stopName || 'Main Stop',
      studentName: student?.name || 'Student',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch student bus info: ' + err.message });
  }
});

// ── GET all routes ─────────────────────────────────────────
router.get('/bus-routes', async (req, res) => {
  try {
    const routes = await BusRoute.find().lean();
    res.json(routes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch routes: ' + err.message });
  }
});

// ── GET single route by ID ─────────────────────────────────
router.get('/bus-routes/:id', async (req, res) => {
  try {
    const route = await BusRoute.findById(req.params.id).lean();
    if (!route) return res.status(404).json({ error: 'Route not found' });
    res.json(route);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch route: ' + err.message });
  }
});

// ── POST create/update route (Admin) ──────────────────────
router.post('/bus-routes', auth, adminOnly, async (req, res) => {
  try {
    const { routeId, routeNumber, routeName, startPoint, endPoint, stops, pathCoordinates, assignBusNumber } = req.body;
    if (!routeNumber || !routeName) {
      return res.status(400).json({ error: 'Route number and name are required' });
    }

    // Prepare stops and auto-generate pathCoordinates if not explicitly passed
    let finalStops = Array.isArray(stops) ? stops : [];
    finalStops = finalStops.map((s, idx) => ({
      stopName: s.stopName || `Stop ${idx + 1}`,
      lat: Number(s.lat) || 12.9716,
      lng: Number(s.lng) || 77.5946,
      order: s.order !== undefined ? Number(s.order) : idx + 1,
      scheduledTime: s.scheduledTime || '',
    }));

    let finalPath = Array.isArray(pathCoordinates) && pathCoordinates.length > 0
      ? pathCoordinates
      : [];

    if (finalPath.length === 0 && finalStops.length > 0) {
      if (finalStops.length === 1) {
        finalPath = [[finalStops[0].lat, finalStops[0].lng]];
      } else {
        for (let i = 0; i < finalStops.length - 1; i++) {
          const p1 = finalStops[i];
          const p2 = finalStops[i + 1];
          const steps = 6;
          for (let s = 0; s < steps; s++) {
            const factor = s / steps;
            finalPath.push([
              Number((p1.lat + (p2.lat - p1.lat) * factor).toFixed(6)),
              Number((p1.lng + (p2.lng - p1.lng) * factor).toFixed(6)),
            ]);
          }
        }
        const last = finalStops[finalStops.length - 1];
        finalPath.push([last.lat, last.lng]);
      }
    }

    let route = null;
    if (routeId) {
      route = await BusRoute.findById(routeId);
    }
    if (!route && routeNumber) {
      route = await BusRoute.findOne({ routeNumber: routeNumber.trim() });
    }

    if (route) {
      route.routeNumber = routeNumber.trim();
      route.routeName = routeName.trim();
      if (startPoint !== undefined) route.startPoint = startPoint.trim();
      if (endPoint !== undefined) route.endPoint = endPoint.trim();
      if (finalStops.length > 0) route.stops = finalStops;
      if (finalPath.length > 0) route.pathCoordinates = finalPath;
      await route.save();
    } else {
      route = await BusRoute.create({
        routeNumber: routeNumber.trim(),
        routeName: routeName.trim(),
        startPoint: startPoint?.trim() || 'Start Station',
        endPoint: endPoint?.trim() || 'EduConnect Campus',
        stops: finalStops,
        pathCoordinates: finalPath,
      });
    }

    // If an assignBusNumber is specified, link the bus to this route
    if (assignBusNumber) {
      await Bus.findOneAndUpdate(
        { busNumber: assignBusNumber.toUpperCase() },
        { routeId: route._id }
      );
    }

    res.json({ success: true, route });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save route: ' + err.message });
  }
});

// ── DELETE route (Admin) ──────────────────────────────────
router.delete('/bus-routes/:id', auth, adminOnly, async (req, res) => {
  try {
    const route = await BusRoute.findByIdAndDelete(req.params.id);
    if (!route) return res.status(404).json({ error: 'Route not found' });
    // Reset any buses linked to this route
    await Bus.updateMany({ routeId: req.params.id }, { $unset: { routeId: 1 } });
    res.json({ success: true, message: 'Route deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete route: ' + err.message });
  }
});

// ── POST create/update bus (Admin) ────────────────────────
router.post('/buses', auth, adminOnly, async (req, res) => {
  try {
    const { busNumber, vehicleNumber, driverName, driverPhone, capacity, routeId, status } = req.body;
    let bus = await Bus.findOne({ busNumber: busNumber.toUpperCase() });
    if (bus) {
      bus.vehicleNumber = vehicleNumber || bus.vehicleNumber;
      bus.driverName = driverName || bus.driverName;
      bus.driverPhone = driverPhone || bus.driverPhone;
      bus.capacity = capacity || bus.capacity;
      if (routeId) bus.routeId = routeId;
      if (status) bus.status = status;
      await bus.save();
    } else {
      bus = await Bus.create({
        busNumber: busNumber.toUpperCase(),
        vehicleNumber,
        driverName,
        driverPhone,
        capacity,
        routeId,
        status: status || 'Idle',
      });
    }
    const populated = await Bus.findById(bus._id).populate('routeId');
    res.json({ success: true, bus: populated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save bus: ' + err.message });
  }
});

// ── POST Assign student to bus ────────────────────────────
router.post('/buses/:busNumber/assign-student', auth, adminOnly, async (req, res) => {
  try {
    const { studentId, busStop } = req.body;
    const bus = await Bus.findOne({ busNumber: req.params.busNumber.toUpperCase() });
    if (!bus) return res.status(404).json({ error: 'Bus not found' });

    if (!bus.assignedStudents.includes(studentId)) {
      bus.assignedStudents.push(studentId);
      await bus.save();
    }

    if (busStop) {
      await Student.findOneAndUpdate({ studentId }, { busId: bus.busNumber, busStop });
    } else {
      await Student.findOneAndUpdate({ studentId }, { busId: bus.busNumber });
    }

    res.json({ success: true, message: `Student ${studentId} assigned to ${bus.busNumber}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign student: ' + err.message });
  }
});

// ── POST update bus telemetry (REST fallback) ─────────────
router.post('/buses/:busNumber/telemetry', async (req, res) => {
  try {
    const { lat, lng, speed, heading, status, currentStopIndex, nextStop, estimatedArrival } = req.body;
    const bus = await Bus.findOne({ busNumber: req.params.busNumber.toUpperCase() });
    if (!bus) return res.status(404).json({ error: 'Bus not found' });

    bus.currentLocation = {
      lat: Number(lat),
      lng: Number(lng),
      speed: Number(speed) || 0,
      heading: Number(heading) || 0,
      updatedAt: new Date(),
    };
    if (status) bus.status = status;
    if (currentStopIndex !== undefined) bus.currentStopIndex = currentStopIndex;
    if (nextStop) bus.nextStop = nextStop;
    if (estimatedArrival) bus.estimatedArrival = estimatedArrival;

    await bus.save();

    // If socket server is available on req.app, broadcast
    const io = req.app.get('io');
    if (io) {
      io.to(`bus:${bus.busNumber}`).emit('bus_location_update', {
        busNumber: bus.busNumber,
        currentLocation: bus.currentLocation,
        status: bus.status,
        currentStopIndex: bus.currentStopIndex,
        nextStop: bus.nextStop,
        estimatedArrival: bus.estimatedArrival,
      });
    }

    res.json({ success: true, bus });
  } catch (err) {
    res.status(500).json({ error: 'Telemetry update failed: ' + err.message });
  }
});

// ── POST Re-seed demo data ────────────────────────────────
router.post('/buses/seed-demo', async (req, res) => {
  try {
    await Bus.deleteMany({});
    await BusRoute.deleteMany({});
    await ensureDemoData();
    res.json({ success: true, message: 'Demo buses and routes re-seeded' });
  } catch (err) {
    res.status(500).json({ error: 'Re-seed failed: ' + err.message });
  }
});

router.ensureDemoData = ensureDemoData;
module.exports = router;
