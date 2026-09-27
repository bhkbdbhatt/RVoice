async function run() {
  const health = await fetch('http://localhost:4000/api/health');
  const healthData = await health.json();
  console.log('health:', healthData);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});