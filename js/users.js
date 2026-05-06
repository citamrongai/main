/* ================================================
   users.js — User database (developer-managed only)
   Media Operations Portal

   HOW TO ADD A USER:
   Copy one of the existing entries below, paste it
   at the end of the array, and fill in the details.
   Save the file. That's it — no backend needed.

   Fields:
     username  — what they type to log in (lowercase)
     password  — their login password
     name      — display name shown in the portal
     role      — their media team role (for display only)
   ================================================ */

const USERS = [
  {
    username: "Tester",
    password: "2422@Godwithus",
    name:     "Emmanuel Lalampaa",
    role:     "Developer"
  },

  {
    username: "Nick",
    password: "nick2024",
    name:     "Nicknol Ooma",
    role:     "Projection Operator"
  },

  /* ── Add more users below this line ─────────────
  {
    username: "mary",
    password: "mary2024",
    name:     "Mary Otieno",
    role:     "Lighting Operator"
  },
  ────────────────────────────────────────────── */
];
