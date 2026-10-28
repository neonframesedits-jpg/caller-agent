// Usage: npm run create-business -- "Mama Tee's Kitchen" "Titilayo" "+2348012345678"
import { config } from "../src/config.js";
import { createBusiness } from "../src/db.js";
import { normalizePhone } from "../src/phone.js";

const [name, ownerName, ownerPhone] = process.argv.slice(2);
if (!name) {
  console.error('Usage: npm run create-business -- "<business name>" [owner name] [owner phone]');
  process.exit(1);
}
const b = createBusiness({ name, ownerName, ownerPhone: ownerPhone ? normalizePhone(ownerPhone) ?? ownerPhone : "" });
console.log(`Created ${b.name}`);
console.log(`  id:          ${b.id}`);
console.log(`  owner token: ${b.ownerToken}`);
console.log(`  dashboard:   ${config.publicUrl}/?token=${b.ownerToken}`);
