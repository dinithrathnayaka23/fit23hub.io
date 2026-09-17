// Must load before any module that reads process.env at import time - jwt.js
// captures JWT_SECRET into a const, so loading it first would otherwise bake in
// the "change-this-secret" fallback and every signed token would be rejected.
import "dotenv/config";
