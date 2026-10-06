// Name pools for fictional NPCs. Common given names and surnames only.
// Surnames of prominent real politicians are deliberately excluded (see BLOCKED_SURNAMES),
// and generated names are checked against that list.
import type { Zone } from './states.js';

const NORTH_FIRST_M = ['Musa', 'Ibrahim', 'Sani', 'Usman', 'Bello', 'Aliyu', 'Haruna', 'Yakubu', 'Garba', 'Idris', 'Kabiru', 'Nasiru', 'Shehu', 'Lawal', 'Danjuma', 'Bashir'];
const NORTH_FIRST_F = ['Aisha', 'Hauwa', 'Zainab', 'Fatima', 'Hadiza', 'Amina', 'Maryam', 'Bilkisu', 'Halima', 'Rukayya', 'Safiya', 'Jamila'];
const NORTH_LAST = ['Danladi', 'Maikudi', 'Dankano', 'Tsoho', 'Gambo', 'Bature', 'Mairiga', 'Dogondaji', 'Kachallah', 'Bakoji', 'Yelwa', 'Maigari', 'Jibrin', 'Tanko', 'Waziri', 'Zubairu'];

const MIDDLE_FIRST_M = ['Terver', 'Ocheme', 'Samuel', 'Daniel', 'Joseph', 'Emmanuel', 'Peter', 'Yohanna', 'Moses', 'Gyang', 'Audu', 'Iorliam'];
const MIDDLE_FIRST_F = ['Mary', 'Comfort', 'Esther', 'Ladi', 'Grace', 'Rhoda', 'Mercy', 'Dooshima', 'Ene', 'Rose'];
const MIDDLE_LAST = ['Agbo', 'Ochai', 'Tyoor', 'Iortyer', 'Dakwo', 'Pam', 'Gyang', 'Adaji', 'Onoja', 'Odeh', 'Ehiemua', 'Shaagee', 'Bawa', 'Yisa'];

const SW_FIRST_M = ['Adebayo', 'Olumide', 'Tunde', 'Segun', 'Kunle', 'Femi', 'Wale', 'Gbenga', 'Dapo', 'Lanre', 'Biodun', 'Yemi', 'Rotimi', 'Kayode'];
const SW_FIRST_F = ['Funke', 'Bisi', 'Yetunde', 'Folake', 'Titilayo', 'Kemi', 'Bukola', 'Toyin', 'Ronke', 'Sade', 'Adunni', 'Omolara'];
const SW_LAST = ['Adeyemi', 'Ogunleye', 'Balogun', 'Olawale', 'Adesanya', 'Afolabi', 'Oyelaran', 'Ajayi', 'Bamidele', 'Adekunle', 'Akinola', 'Oladipo', 'Ige-Coker', 'Adebisi', 'Ayinde'];

const SE_FIRST_M = ['Chukwuemeka', 'Obinna', 'Ikenna', 'Nnamdi', 'Chinedu', 'Emeka', 'Uche', 'Kelechi', 'Ifeanyi', 'Chidi', 'Okechukwu', 'Somto'];
const SE_FIRST_F = ['Ngozi', 'Chiamaka', 'Adaeze', 'Nneka', 'Ifeoma', 'Chinwe', 'Uju', 'Amaka', 'Obioma', 'Ebere', 'Chioma'];
const SE_LAST = ['Okafor', 'Eze', 'Nwosu', 'Okeke', 'Nwankwo', 'Onyeka', 'Ezeani', 'Obiora', 'Anyanwu', 'Ugwu', 'Nnaji', 'Okonkwo', 'Iwuchukwu', 'Ibe'];

const SS_FIRST_M = ['Preye', 'Tamuno', 'Ekpo', 'Effiong', 'Ovie', 'Oghenekaro', 'Tonye', 'Ibinabo', 'Etim', 'Osaro', 'Ese', 'Bassey'];
const SS_FIRST_F = ['Ebiere', 'Tari', 'Idara', 'Imaobong', 'Oghenetega', 'Ibiere', 'Ekaette', 'Osas', 'Ufuoma', 'Boma', 'Ini'];
const SS_LAST = ['Ekpenyong', 'Okon', 'Douglas', 'Briggs', 'Ebiye', 'Omatseye', 'Edet', 'Inyang', 'Osagie', 'Eguavoen', 'Tobi', 'Ogbeide', 'Idoniboye', 'Etete'];

export interface NamePool {
  firstMale: string[];
  firstFemale: string[];
  last: string[];
}

export const NAME_POOLS: Record<Zone, NamePool> = {
  NW: { firstMale: NORTH_FIRST_M, firstFemale: NORTH_FIRST_F, last: NORTH_LAST },
  NE: { firstMale: NORTH_FIRST_M, firstFemale: NORTH_FIRST_F, last: NORTH_LAST },
  NC: { firstMale: MIDDLE_FIRST_M, firstFemale: MIDDLE_FIRST_F, last: MIDDLE_LAST },
  SW: { firstMale: SW_FIRST_M, firstFemale: SW_FIRST_F, last: SW_LAST },
  SE: { firstMale: SE_FIRST_M, firstFemale: SE_FIRST_F, last: SE_LAST },
  SS: { firstMale: SS_FIRST_M, firstFemale: SS_FIRST_F, last: SS_LAST },
};

/** Satirical honorifics that get prefixed to NPC politicians now and then. */
export const HONORIFICS = ['Chief', 'Alhaji', 'Hajiya', 'Dr.', 'Engr.', 'Barr.', 'Prince', 'Comrade', 'Otunba', 'Elder', 'Mrs.', 'Mr.'];

/** Surnames of prominent real politicians: never used for generated NPCs, also used by the name filter later. */
export const BLOCKED_SURNAMES = [
  'tinubu', 'buhari', 'obasanjo', 'jonathan', "yar'adua", 'yaradua', 'shettima', 'kwankwaso', 'wike', 'atiku',
  'saraki', 'akpabio', 'el-rufai', 'elrufai', 'ganduje', 'fayemi', 'makinde', 'sanwo-olu', 'okowa', 'oshiomhole',
  'soludo', 'uzodimma', 'umahi', 'otti', 'fubara', 'amaechi', 'fashola', 'abacha', 'babangida', 'osinbajo', 'ikpeazu', 'igbinedion', 'okonjo', 'okonjo-iweala', 'lamido',
];
