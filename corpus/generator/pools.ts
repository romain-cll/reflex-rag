// Fictional names and topics. Names stick to ASCII letters so they are valid
// in Obsidian file names; no list may contain a term from ABSENT_TOPICS.

export const FIRST_NAMES = [
  "Dana", "Marcus", "Priya", "Elena", "Tomas", "Grace", "Kenji", "Aisha",
  "Owen", "Lucia", "Samir", "Hannah", "Diego", "Mei", "Jonah", "Fatima",
  "Caleb", "Ingrid", "Rafael", "Nadia", "Theo", "Amara", "Victor", "Leah",
  "Ravi", "Sofia", "Malik", "Claire", "Andre", "Yuki", "Isaac", "Zoe",
  "Hector", "Naomi", "Felix", "Ruth", "Omar", "Tessa", "Gabriel", "Lena",
  "Arjun", "Maya", "Simon", "Carmen", "Wesley", "Ines", "Desmond", "Hazel",
  "Julian", "Esther", "Kofi", "Vera", "Nolan", "Rosa", "Emeka", "Clara",
  "Mateo", "Ivy", "Bennett", "Anya", "Luis", "Freya", "Tariq", "Joanna",
] // prettier-ignore

export const LAST_NAMES = [
  "Whitfield", "Okafor", "Raman", "Novak", "Brennan", "Castillo", "Hayashi",
  "Lindqvist", "Mercer", "Abara", "Delacroix", "Fitzgerald", "Haddad",
  "Ibarra", "Jansen", "Kowalski", "Larsen", "Moreau", "Nakamura", "Osei",
  "Petrov", "Quinlan", "Rasmussen", "Sato", "Thorne", "Underwood", "Varga",
  "Whitaker", "Yilmaz", "Zielinski", "Ashby", "Bishop", "Calloway", "Dunmore",
  "Ellison", "Farrow", "Gallagher", "Holloway", "Iverson", "Kaplan", "Lowell",
  "Mbeki", "Nordin", "Ortega", "Pruitt", "Ramsey", "Sorensen", "Tanaka",
  "Vance", "Weller", "Adeyemi", "Boyle", "Chandra", "Duarte", "Engel",
  "Foley", "Greer", "Hart", "Keane", "Lund", "Mills", "Navarro", "Reyes",
] // prettier-ignore

export const OFFICES = ["Portland", "Portland", "Denver", "Austin"]

export const EXECUTIVES = [
  { title: "Chief Executive Officer", team: "Executive" },
  { title: "Chief Operating Officer", team: "Executive" },
  { title: "VP of Engineering", team: "Engineering" },
  { title: "VP of Sales", team: "Sales" },
  { title: "Head of Procurement", team: "Operations" },
  { title: "Head of Customer Success", team: "Customer Success" },
]

/** Staff per unit of scale, and the promotion one of them gets. */
export const STAFF = {
  pm: { title: "Product Manager", team: "Product", count: 3 },
  me: { title: "Mechanical Engineer", team: "Hardware Engineering", count: 2 },
  ee: { title: "Electrical Engineer", team: "Hardware Engineering", count: 2 },
  fw: { title: "Firmware Engineer", team: "Firmware", count: 2 },
  ae: { title: "Account Executive", team: "Sales", count: 4 },
  csm: { title: "Customer Success Manager", team: "Customer Success", count: 2 },
  procurement: { title: "Procurement Specialist", team: "Operations", count: 1 },
  qe: { title: "Quality Engineer", team: "Operations", count: 1 },
} as const // prettier-ignore

export type StaffKey = keyof typeof STAFF

export const PROMOTIONS: { from: StaffKey; title: string; team: string }[] = [
  { from: "pm", title: "Senior Product Manager", team: "Product" },
  { from: "ae", title: "Senior Account Executive", team: "Sales" },
  { from: "me", title: "Mechanical Engineering Lead", team: "Hardware Engineering" },
  { from: "csm", title: "Account Executive", team: "Sales" },
  { from: "fw", title: "Firmware Lead", team: "Firmware" },
] // prettier-ignore

export const CUSTOMER_PREFIXES = [
  "Harborview", "Maple Ridge", "Cedar Point", "Riverside", "Summit Park",
  "Lakeshore", "Oak Hollow", "Pine Valley", "Westgate", "Silver Creek",
  "Fairhaven", "Crescent Bay", "Stonebridge", "Granite Falls", "Clearwater",
  "Highland", "Meadowbrook", "Bayside", "Northgate", "Redwood Hills",
  "Sunridge", "Copper Canyon", "Bellmont", "Ashford", "Glenwood", "Kingsley",
  "Larchmont", "Marlowe", "Newbury", "Orchard Hill", "Prescott", "Quarry Lake",
  "Rosewood", "Sheridan", "Thornbury", "Valemont", "Whitmore", "Easton",
  "Foxborough", "Hollins",
] // prettier-ignore

export const CUSTOMER_SEGMENTS = [
  { segment: "property management", suffixes: ["Property Group", "Realty Partners"] },
  { segment: "school district", suffixes: ["School District", "Unified Schools"] },
  { segment: "hospital", suffixes: ["Medical Center", "Regional Hospital"] },
  { segment: "university", suffixes: ["University", "College"] },
  { segment: "corporate campus", suffixes: ["Campus Services", "Workplace Group"] },
] // prettier-ignore

export const CUSTOMER_CITIES = [
  "Sacramento", "Boise", "Spokane", "Tacoma", "Eugene", "Reno", "Salt Lake City",
  "Denver", "Phoenix", "Tucson", "Albuquerque", "Austin", "Dallas",
  "Minneapolis", "Madison", "Chicago", "Columbus", "Pittsburgh", "Raleigh",
  "Richmond", "Baltimore", "Hartford", "Providence", "Burlington",
] // prettier-ignore

export const CONTACT_TITLES = [
  "Facilities Director",
  "Director of Operations",
  "Facilities Manager",
  "Head of Building Services",
]

export const SUPPLIER_PREFIXES = [
  "Pinecrest", "Moldcraft", "Cobalt", "Northfield", "Brightline", "Tidewater",
  "Cascade", "Ironwood", "Bluegate", "Keystone", "Lattice", "Orion",
  "Pacifica", "Ridgeline", "Sterling", "Trident", "Vantage", "Wexford",
  "Anvil", "Bramble", "Cypress", "Dovetail", "Everest", "Fulcrum", "Gemini",
  "Halcyon", "Ironbark", "Juno", "Kingfisher", "Lodestar", "Mariner",
  "Northstar", "Oakmont", "Paragon", "Redstone", "Silverline", "Tamarack",
  "Upland", "Verity", "Westwind",
] // prettier-ignore

export const SUPPLIER_CATEGORIES = [
  { category: "enclosure", label: "enclosure", suffixes: ["Plastics", "Molding"], perScale: 3, overseas: true },
  { category: "pcb assembly", label: "circuit board", suffixes: ["Circuits", "Electronics"], perScale: 2, overseas: true },
  { category: "sensor", label: "sensor module", suffixes: ["Sensing", "Photonics"], perScale: 2, overseas: true },
  { category: "battery", label: "battery pack", suffixes: ["Power", "Energy"], perScale: 1, overseas: true },
  { category: "packaging", label: "packaging", suffixes: ["Packaging"], perScale: 1, overseas: true },
  { category: "certification lab", label: "certification testing", suffixes: ["Compliance Labs", "Test Labs"], perScale: 1, overseas: false },
] // prettier-ignore

export const OVERSEAS_CITIES = [
  "Shenzhen", "Dongguan", "Penang", "Monterrey", "Guadalajara", "Taichung",
  "Hsinchu", "Tijuana", "Suzhou", "Ho Chi Minh City",
] // prettier-ignore

export const LAB_CITIES = ["Fremont", "Boulder", "San Jose", "Lake Forest"]

export const CODENAMES = [
  "Atlas", "Cirrus", "Dune", "Ember", "Fjord", "Granite", "Indigo", "Juniper",
  "Kestrel", "Lumen", "Nimbus", "Orchid", "Prism", "Quartz", "Raven",
  "Sierra", "Tundra", "Umber", "Vireo", "Xenon", "Yarrow", "Zephyr", "Aspen",
  "Basalt", "Cobble", "Delta", "Egret", "Falcon", "Garnet", "Heron", "Iris",
  "Jasper", "Mesa", "Nova", "Onyx", "Pebble", "Rook", "Sable", "Talon",
  "Ursa", "Vega", "Wren", "Yucca", "Zinc", "Amber", "Birch", "Cinder",
  "Drift", "Flint", "Gale", "Ion", "Kite", "Lynx", "Mica", "Nectar", "Opal",
  "Reef", "Slate", "Thistle", "Umbra", "Vale", "Wisp", "Cobalt Bay", "Solstice",
] // prettier-ignore

export const PRODUCT_LINES = [
  "Aura", "Vista", "Halo", "Breeze", "Sentinel", "Pulse", "Canopy", "Echo",
  "Haven", "Strata",
] // prettier-ignore

export const PROJECT_GOALS = [
  { goal: "a battery-powered CO2 monitor for classrooms", anchor: "CO2 monitor" },
  { goal: "a hospital-grade particulate sensor for patient rooms", anchor: "particulate sensor" },
  { goal: "an outdoor-rated air-quality station for building entrances", anchor: "air-quality station" },
  { goal: "a low-cost sensor for open-plan offices", anchor: "low-cost sensor" },
  { goal: "a ceiling-mounted sensor for retrofit projects", anchor: "ceiling-mounted sensor" },
  { goal: "a gateway that collects readings across a multi-floor building", anchor: "gateway" },
  { goal: "a radon and VOC monitor for basements", anchor: "radon" },
  { goal: "a sensor kit for school gyms and auditoriums", anchor: "sensor kit" },
] // prettier-ignore

export const COMPONENTS = [
  { category: "pcb assembly", label: "circuit board assembly", unit: "board" },
  { category: "sensor", label: "sensor module", unit: "module" },
  { category: "battery", label: "battery pack", unit: "pack" },
] as const

export const DVT_FINDINGS = [
  { text: "condensation inside the humidity sensor channel", anchor: "condensation" },
  { text: "a cracked battery door after the drop test", anchor: "battery door" },
  { text: "Wi-Fi dropouts near metal ceiling grids", anchor: "Wi-Fi dropouts" },
  { text: "a CO2 reading drift above 35 degrees Celsius", anchor: "reading drift" },
  { text: "a loose light pipe over the status LED", anchor: "light pipe" },
  { text: "firmware resets when the gateway reboots", anchor: "firmware resets" },
] // prettier-ignore

export const PROJECT_UNDECIDED = [
  { phrase: "switching to USB-C power", anchor: "USB-C" },
  { phrase: "adding an e-ink display", anchor: "e-ink" },
  { phrase: "offering the wall-mount bracket in white", anchor: "wall-mount bracket" },
  { phrase: "using recycled plastic for the enclosure", anchor: "recycled plastic" },
  { phrase: "adding Bluetooth commissioning", anchor: "Bluetooth" },
  { phrase: "adding a cellular backhaul option", anchor: "cellular backhaul" },
] // prettier-ignore

export const COMPANY_UNDECIDED = [
  { phrase: "opening a second warehouse in Reno", anchor: "second warehouse" },
  { phrase: "moving the sales team to a new CRM", anchor: "CRM" },
  { phrase: "launching a hardware-as-a-service plan", anchor: "hardware-as-a-service" },
] // prettier-ignore

/** Topics the vault must never mention, for the "no answer" questions. */
export const ABSENT_TOPICS = {
  project: [
    { topic: "patent filing", terms: ["patent", "patents", "patented"] },
    { topic: "crowdfunding campaign", terms: ["crowdfunding", "Kickstarter", "Indiegogo"] },
    { topic: "launch in Japan", terms: ["Japan", "Japanese"] },
  ],
  customer: [
    { topic: "Net Promoter Score", terms: ["NPS", "Net Promoter"] },
    { topic: "data-residency requirements", terms: ["data residency", "data-residency"] },
  ],
  supplier: [
    { topic: "ISO 14001 certification", terms: ["ISO 14001"] },
    { topic: "carbon footprint report", terms: ["carbon footprint"] },
  ],
  company: [
    { topic: "SOC 2 audit", terms: ["SOC 2"] },
    { topic: "Series C funding round", terms: ["Series C"] },
    { topic: "holiday party venue", terms: ["holiday party"] },
    { topic: "four-day work week trial", terms: ["four-day"] },
    { topic: "office in Seattle", terms: ["Seattle"] },
  ],
} // prettier-ignore

export const QUOTE_TERMS = [
  "quote",
  "quotes",
  "quoted",
  "quotation",
  "bid",
  "bids",
]
