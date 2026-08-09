const router = require('express').Router();
const mongoose = require('mongoose');
const { Student, Bus, Route } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// Parent bus tracker summary
router.get('/bus-tracker/me', auth, async (req, res) => {
  if (req.user.role !== 'parent') return res.status(403).json({ error: 'Parent access required.' });
  if (!req.user.studentId) return res.status(400).json({ error: 'No linked student found.' });

  const student = await Student.findOne({ studentId: req.user.studentId })
    .populate({ path: 'busId', populate: { path: 'routeId' } });
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  if (!student.busId) return res.json({ assigned: false, message: 'No bus assigned yet.' });

  // student.busId may be a Mongoose document with a populated `routeId`,
  // or it may already be a plain object; handle both safely.
  const busDoc = student.busId;
  let bus = busDoc;
  let route = null;

  if (busDoc && typeof busDoc.toObject === 'function') {
    bus = busDoc.toObject();
  }

  if (busDoc && busDoc.routeId) {
    if (busDoc.routeId && typeof busDoc.routeId.toObject === 'function') route = busDoc.routeId.toObject();
    else if (typeof busDoc.routeId === 'object') route = busDoc.routeId;
    else route = null;
  }

  res.json({ assigned: true, bus, route, pickupPoint: student.pickupPoint || null, dropPoint: student.dropPoint || null });
});

// Admin buses
router.get('/buses', auth, adminOnly, async (req, res) => {
  const buses = await Bus.find().populate('routeId').sort({ busNo: 1 });
  res.json(buses);
});

router.get('/buses/:id', auth, adminOnly, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid bus id.' });
  const bus = await Bus.findById(req.params.id).populate('routeId');
  if (!bus) return res.status(404).json({ error: 'Bus not found.' });
  res.json(bus);
});

router.post('/buses', auth, adminOnly, async (req, res) => {
  try {
    const { busNo, driverName, driverPhone, routeId, currentLocation, eta, status, coordinates } = req.body;
    if (!busNo || !driverName) return res.status(400).json({ error: 'busNo and driverName are required.' });
    if (routeId && !isValidId(routeId)) return res.status(400).json({ error: 'Invalid routeId.' });

    const bus = await Bus.create({
      busNo: busNo.trim(),
      driverName: driverName.trim(),
      driverPhone: driverPhone?.trim(),
      routeId: routeId ? new mongoose.Types.ObjectId(routeId) : undefined,
      currentLocation: currentLocation?.trim() || 'Not available',
      eta: eta?.trim() || 'TBD',
      status: status?.trim() || 'On Route',
      coordinates,
      history: [{
        location: currentLocation?.trim() || 'Not available',
        eta: eta?.trim() || 'TBD',
        status: status?.trim() || 'On Route',
        coordinates,
        updatedAt: new Date(),
      }],
    });

    res.json(bus);
  } catch (err) {
    if (err.code === 11000 && err.keyValue && err.keyValue.busNo) {
      return res.status(409).json({ error: `Bus number '${err.keyValue.busNo}' already exists.` });
    }
    console.error('Bus creation failed:', err);
    res.status(500).json({ error: 'Failed to create bus.' });
  }
});

router.put('/buses/:id', auth, adminOnly, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid bus id.' });
  const { busNo, driverName, driverPhone, routeId, currentLocation, eta, status, coordinates } = req.body;
  const bus = await Bus.findById(req.params.id);
  if (!bus) return res.status(404).json({ error: 'Bus not found.' });

  if (busNo) bus.busNo = busNo.trim();
  if (driverName) bus.driverName = driverName.trim();
  if (driverPhone != null) bus.driverPhone = driverPhone.trim();
  if (routeId) {
    if (!isValidId(routeId)) return res.status(400).json({ error: 'Invalid routeId.' });
    bus.routeId = new mongoose.Types.ObjectId(routeId);
  }
  if (currentLocation != null) bus.currentLocation = currentLocation.trim();
  if (eta != null) bus.eta = eta.trim();
  if (status != null) bus.status = status.trim();
  if (coordinates != null) bus.coordinates = coordinates;

  const resetHistory = currentLocation || eta || status || coordinates;
  if (resetHistory) {
    bus.history = bus.history || [];
    bus.history.push({
      location: bus.currentLocation,
      eta: bus.eta,
      status: bus.status,
      coordinates: bus.coordinates,
      updatedAt: new Date(),
    });
  }

  await bus.save();
  const populated = await bus.populate('routeId');
  res.json(populated);
});

router.delete('/buses/:id', auth, adminOnly, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid bus id.' });
  await Bus.findByIdAndDelete(req.params.id);
  await Student.updateMany({ busId: req.params.id }, { $unset: { busId: 1, pickupPoint: 1, dropPoint: 1 } });
  res.json({ message: 'Bus deleted.' });
});

router.get('/buses/:id/history', auth, adminOnly, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid bus id.' });
  const bus = await Bus.findById(req.params.id);
  if (!bus) return res.status(404).json({ error: 'Bus not found.' });
  res.json(bus.history || []);
});

// Admin routes
router.get('/routes', auth, adminOnly, async (req, res) => {
  const routes = await Route.find().sort({ name: 1 });
  res.json(routes);
});

router.post('/routes', auth, adminOnly, async (req, res) => {
  const { routeCode, name, stops, description } = req.body;
  if (!routeCode || !name) return res.status(400).json({ error: 'routeCode and name are required.' });
  const route = await Route.create({
    routeCode: routeCode.trim(),
    name: name.trim(),
    stops: Array.isArray(stops) ? stops.map(s => s.trim()).filter(Boolean) : (typeof stops === 'string' ? stops.split(',').map(s => s.trim()).filter(Boolean) : []),
    description: description?.trim(),
  });
  res.json(route);
});

router.put('/routes/:id', auth, adminOnly, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid route id.' });
  const { routeCode, name, stops, description } = req.body;
  const route = await Route.findById(req.params.id);
  if (!route) return res.status(404).json({ error: 'Route not found.' });
  if (routeCode) route.routeCode = routeCode.trim();
  if (name) route.name = name.trim();
  if (description != null) route.description = description.trim();
  if (stops != null) route.stops = Array.isArray(stops) ? stops.map(s => s.trim()).filter(Boolean) : (typeof stops === 'string' ? stops.split(',').map(s => s.trim()).filter(Boolean) : route.stops);
  await route.save();
  res.json(route);
});

router.delete('/routes/:id', auth, adminOnly, async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid route id.' });
  await Route.findByIdAndDelete(req.params.id);
  res.json({ message: 'Route deleted.' });
});

router.put('/students/:studentId/bus', auth, adminOnly, async (req, res) => {
  const { studentId } = req.params;
  const { busId, pickupPoint, dropPoint } = req.body;
  if (!studentId) return res.status(400).json({ error: 'studentId required.' });
  const student = await Student.findOne({ studentId });
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  if (busId && !isValidId(busId)) return res.status(400).json({ error: 'Invalid busId.' });
  student.busId = busId ? new mongoose.Types.ObjectId(busId) : undefined;
  student.pickupPoint = pickupPoint?.trim() || undefined;
  student.dropPoint = dropPoint?.trim() || undefined;
  await student.save();
  res.json({ message: 'Student bus assignment updated.', student });
});

module.exports = router;
