const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

function toClient(r) {
  return {
    firstName: r.first_name || '',
    netSalary: Number(r.net_salary) || 0,
    hasCar: r.has_car ?? true,
    isSmoker: r.is_smoker ?? false,
    householdAdults: r.household_adults ?? 1,
    householdChildren: r.household_children ?? 0,
    pets: r.pets || { dogs: 0, cats: 0, other: 0 },
    region: r.region || 'Île-de-France',
    supermarket: r.supermarket || 'leclerc',
    registrationDate: r.registration_date || null,
    onboardingDone: r.onboarding_done ?? false,
  };
}

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [req.user.userId]);
  res.json(rows[0] ? toClient(rows[0]) : {});
});

router.put('/', async (req, res) => {
  const { firstName, netSalary, hasCar, isSmoker, householdAdults, householdChildren, pets, region, supermarket, registrationDate, onboardingDone } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO profiles (user_id, first_name, net_salary, has_car, is_smoker, household_adults, household_children, pets, region, supermarket, registration_date, onboarding_done)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (user_id) DO UPDATE SET
      first_name = COALESCE($2, profiles.first_name),
      net_salary = COALESCE($3, profiles.net_salary),
      has_car = COALESCE($4, profiles.has_car),
      is_smoker = COALESCE($5, profiles.is_smoker),
      household_adults = COALESCE($6, profiles.household_adults),
      household_children = COALESCE($7, profiles.household_children),
      pets = COALESCE($8, profiles.pets),
      region = COALESCE($9, profiles.region),
      supermarket = COALESCE($10, profiles.supermarket),
      registration_date = COALESCE($11, profiles.registration_date),
      onboarding_done = COALESCE($12, profiles.onboarding_done)
     RETURNING *`,
    [
      req.user.userId,
      firstName ?? null,
      netSalary ?? null,
      hasCar ?? null,
      isSmoker ?? null,
      householdAdults ?? null,
      householdChildren ?? null,
      pets ? JSON.stringify(pets) : null,
      region ?? null,
      supermarket ?? null,
      registrationDate ?? null,
      onboardingDone ?? null,
    ]
  );
  res.json(toClient(rows[0]));
});

module.exports = router;
