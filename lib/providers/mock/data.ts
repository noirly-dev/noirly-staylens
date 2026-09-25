/**
 * Vocabulary for the offline mock world. These are realistic provider strings — the
 * scoring engine only knows about them through filter synonyms in config/filters.json.
 */
export const NAME_PREFIXES = [
  "Misty Hills", "Coffee Trails", "Riverside", "Silver Oak", "Tamarind", "Banyan Tree", "Lotus Pond",
  "Hilltop", "Emerald Valley", "Cloud Nine", "Wild Orchid", "Palm Grove", "Kaveri", "Blue Lagoon",
  "Stone Creek", "Sandalwood", "Monsoon", "Firefly", "Cardamom", "Rainforest", "Sunset Ridge",
  "Old Mill", "Peacock", "Lakeview", "Bamboo", "Mango Orchard", "Granite", "Jasmine", "Teak Wood", "Elephant Rock",
];

export const STAY_KINDS = [
  { suffix: "Resort", types: ["resort_hotel", "lodging"], base: 7000 },
  { suffix: "Pool Villa", types: ["lodging", "private_guest_room"], base: 11000 },
  { suffix: "Villas", types: ["lodging"], base: 9000 },
  { suffix: "Homestay", types: ["guest_house", "lodging"], base: 2500 },
  { suffix: "Farmstay", types: ["farmstay", "lodging"], base: 3500 },
  { suffix: "Plantation Estate", types: ["lodging"], base: 6000 },
  { suffix: "Boutique Hotel", types: ["hotel", "lodging"], base: 4500 },
  { suffix: "Jungle Camp", types: ["campground", "lodging"], base: 2800 },
  { suffix: "Retreat", types: ["resort_hotel", "lodging"], base: 6500 },
] as const;

export const AMENITIES: { name: string; p: number }[] = [
  { name: "Free Wi-Fi", p: 0.8 },
  { name: "Outdoor pool", p: 0.4 },
  { name: "Private pool", p: 0.12 },
  { name: "Spa", p: 0.3 },
  { name: "Free breakfast", p: 0.55 },
  { name: "Free parking", p: 0.7 },
  { name: "Pet-friendly", p: 0.25 },
  { name: "Fitness center", p: 0.2 },
  { name: "Restaurant", p: 0.6 },
  { name: "Bar", p: 0.35 },
  { name: "Room service", p: 0.4 },
  { name: "Kid-friendly", p: 0.4 },
  { name: "Air conditioning", p: 0.6 },
  { name: "Hot tub", p: 0.15 },
  { name: "Kitchen", p: 0.2 },
  { name: "EV charger", p: 0.1 },
  { name: "Airport shuttle", p: 0.1 },
  { name: "Wheelchair accessible", p: 0.2 },
  { name: "Bonfire", p: 0.35 },
  { name: "Indoor games", p: 0.3 },
];

export const DESCRIPTION_PHRASES: { text: string; p: number }[] = [
  { text: "A secluded hideaway surrounded by coffee plantations.", p: 0.25 },
  { text: "Peaceful cottages where the only sound is birdsong.", p: 0.2 },
  { text: "Lively property with DJ nights every weekend.", p: 0.15 },
  { text: "Perfect for families, with a kids play area and family suites.", p: 0.3 },
  { text: "Dedicated work desks, high speed internet and power backup make it workation friendly.", p: 0.2 },
  { text: "Rooms overlook the valley with sweeping views of the hills.", p: 0.3 },
  { text: "Every villa has its own plunge pool and sundeck.", p: 0.12 },
  { text: "Pets are welcome, with a fenced lawn for dogs.", p: 0.15 },
  { text: "Close to the highway, so expect some traffic noise.", p: 0.12 },
  { text: "Set deep in the forest near a wildlife sanctuary.", p: 0.2 },
  { text: "Riverside tents with guided treks and kayaking.", p: 0.12 },
  { text: "Ayurveda spa treatments and daily yoga sessions.", p: 0.2 },
  { text: "Lake view rooms and candle-lit dinners by the water.", p: 0.15 },
];

export const REVIEW_PHRASES = [
  "Very calm and serene, exactly what we needed.",
  "Staff were friendly and the food was excellent.",
  "Wi-Fi was patchy, not great for working.",
  "Our kids loved the play area and the pool.",
  "Loud music from the neighbouring party till late.",
  "Stunning views from the balcony at sunrise.",
  "Clean rooms, a bit overpriced for what you get.",
  "Great for remote work, fast internet and a quiet desk.",
  "Brought our dog and they were very accommodating.",
  "Tranquil place in the middle of a plantation.",
];

/** Offline gazetteer for geocoding without Google. */
export const CITIES: { names: string[]; label: string; lat: number; lng: number }[] = [
  { names: ["bengaluru", "bangalore", "blr"], label: "Bengaluru, Karnataka", lat: 12.9716, lng: 77.5946 },
  { names: ["mumbai", "bombay"], label: "Mumbai, Maharashtra", lat: 19.076, lng: 72.8777 },
  { names: ["delhi", "new delhi"], label: "New Delhi, Delhi", lat: 28.6139, lng: 77.209 },
  { names: ["chennai", "madras"], label: "Chennai, Tamil Nadu", lat: 13.0827, lng: 80.2707 },
  { names: ["hyderabad"], label: "Hyderabad, Telangana", lat: 17.385, lng: 78.4867 },
  { names: ["pune"], label: "Pune, Maharashtra", lat: 18.5204, lng: 73.8567 },
  { names: ["kolkata", "calcutta"], label: "Kolkata, West Bengal", lat: 22.5726, lng: 88.3639 },
  { names: ["goa", "panaji"], label: "Panaji, Goa", lat: 15.4909, lng: 73.8278 },
  { names: ["mysuru", "mysore"], label: "Mysuru, Karnataka", lat: 12.2958, lng: 76.6394 },
  { names: ["kochi", "cochin"], label: "Kochi, Kerala", lat: 9.9312, lng: 76.2673 },
  { names: ["jaipur"], label: "Jaipur, Rajasthan", lat: 26.9124, lng: 75.7873 },
  { names: ["ahmedabad"], label: "Ahmedabad, Gujarat", lat: 23.0225, lng: 72.5714 },
  { names: ["coimbatore"], label: "Coimbatore, Tamil Nadu", lat: 11.0168, lng: 76.9558 },
  { names: ["mangaluru", "mangalore"], label: "Mangaluru, Karnataka", lat: 12.9141, lng: 74.856 },
  { names: ["chandigarh"], label: "Chandigarh", lat: 30.7333, lng: 76.7794 },
];
