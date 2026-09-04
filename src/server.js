require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT;
if (!PORT) {
  console.error('[server] PORT is not set in the environment (.env)');
  process.exit(1);
}

connectDB()
  .then(() => app.listen(PORT, () => console.log(`[server] listening on :${PORT}`)))
  .catch((err) => {
    console.error('[db] connection failed', err);
    process.exit(1);
  });
