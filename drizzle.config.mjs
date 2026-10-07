export default {
  schema: "./src/db/drizzle-schema.mjs",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? ""
  }
};
