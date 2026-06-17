  import pool from "./config/database.js";

try {
  const result = await pool.query(`
    SELECT
      current_database(),
      current_user,
      NOW()
  `);

  console.log(result.rows[0]);

  await pool.end();
} catch (err) {
  console.error(err);
}