const test = require('node:test');
const assert = require('node:assert/strict');

const auth = require('../routes/auth');

test('staff login emails normalize to the school domain', () => {
  assert.equal(auth.normalizeStaffLoginEmail('tejas'), 'tejas@school.edu.in');
  assert.equal(auth.normalizeStaffLoginEmail('TEJAS@SCHOOL.EDU.IN'), 'tejas@school.edu.in');
  assert.equal(auth.normalizeStaffLoginEmail('tejas@school.edu.in'), 'tejas@school.edu.in');
});
