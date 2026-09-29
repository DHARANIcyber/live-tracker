const syncBusLocation = async ({ app, busId, latitude, longitude, accuracy, status, timestamp, useMongo = false, busModel = null }) => {
  if (!busId) return null;

  if (useMongo && busModel) {
    const updatedBus = await busModel.findOneAndUpdate(
      { _id: busId },
      {
        currentLocation: { latitude, longitude },
        accuracy,
        status,
        lastUpdated: timestamp || new Date()
      },
      { new: true }
    );

    return updatedBus;
  }

  const buses = app.locals?.buses || [];
  const bus = buses.find((item) => String(item._id) === String(busId));

  if (!bus) return null;

  bus.currentLocation = { latitude: Number(latitude), longitude: Number(longitude) };
  bus.accuracy = Number(accuracy);
  bus.status = status || 'OFFLINE';
  bus.lastUpdated = timestamp || new Date();

  app.locals.buses = buses;
  return bus;
};

module.exports = { syncBusLocation };
