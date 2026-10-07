const { Bus } = require('../models');

// Haversine formula to compute distance between two lat/lng in kilometers
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function initBusSocket(io) {
  // Throttle DB updates per bus to avoid overloading MongoDB
  const lastDbUpdate = {};

  io.on('connection', (socket) => {
    // Parent or Admin joins a specific bus room
    socket.on('join_bus', (busNumber) => {
      if (!busNumber) return;
      const room = `bus:${busNumber.toUpperCase()}`;
      socket.join(room);
    });

    socket.on('leave_bus', (busNumber) => {
      if (!busNumber) return;
      const room = `bus:${busNumber.toUpperCase()}`;
      socket.leave(room);
    });

    // Driver sends live GPS location telemetry
    socket.on('driver_location_update', async (data) => {
      try {
        const { busNumber, lat, lng, speed, heading, status, currentStopIndex, nextStop, estimatedArrival } = data;
        if (!busNumber || lat === undefined || lng === undefined) return;

        const cleanBusNumber = busNumber.toUpperCase();
        const payload = {
          busNumber: cleanBusNumber,
          currentLocation: {
            lat: Number(lat),
            lng: Number(lng),
            speed: Number(speed) || 0,
            heading: Number(heading) || 0,
            updatedAt: new Date(),
          },
          status: status || 'On Route',
          currentStopIndex: currentStopIndex !== undefined ? currentStopIndex : 0,
          nextStop: nextStop || '',
          estimatedArrival: estimatedArrival || '',
        };

        // 1. Instantly broadcast to all parents & admins in room
        io.to(`bus:${cleanBusNumber}`).emit('bus_location_update', payload);

        // 2. Also broadcast to a general fleet room for admin overview
        io.to('admin_fleet').emit('bus_location_update', payload);

        // 3. Persist to MongoDB at most once every 3 seconds per bus
        const now = Date.now();
        if (!lastDbUpdate[cleanBusNumber] || (now - lastDbUpdate[cleanBusNumber] > 3000)) {
          lastDbUpdate[cleanBusNumber] = now;
          Bus.findOneAndUpdate(
            { busNumber: cleanBusNumber },
            {
              currentLocation: payload.currentLocation,
              status: payload.status,
              currentStopIndex: payload.currentStopIndex,
              nextStop: payload.nextStop,
              estimatedArrival: payload.estimatedArrival,
            }
          ).catch((e) => console.error('Error persisting bus telemetry:', e.message));
        }
      } catch (err) {
        console.error('Bus socket handler error:', err.message);
      }
    });

    // Driver changes trip status (e.g., 'On Route', 'Idle', 'Completed')
    socket.on('driver_status_change', async ({ busNumber, status }) => {
      if (!busNumber || !status) return;
      const cleanBusNumber = busNumber.toUpperCase();
      io.to(`bus:${cleanBusNumber}`).emit('bus_status_change', { busNumber: cleanBusNumber, status });
      await Bus.findOneAndUpdate({ busNumber: cleanBusNumber }, { status }).catch(() => {});
    });

    // Admin joins fleet monitoring room
    socket.on('join_admin_fleet', () => {
      socket.join('admin_fleet');
    });
  });

  console.log('✅ Live Bus Tracking WebSocket service initialized');
}

module.exports = { initBusSocket, getDistanceKm };
