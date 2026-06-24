const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://alexpluxury2_db_user:alex9012@cluster0.wbwdgff.mongodb.net/?appName=Cluster0';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  originalPrice: { type: Number },
  image: { type: String, required: true },
  category: { type: String, default: 'General' },
  badge: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

const sampleProducts = [
  {
    name: "Steam Wallet Gift Card $20",
    description: "Get instant digital delivery of Steam Wallet codes. Refuel your Steam balance to buy your favorite PC games, DLCs, and software. Quick checkout verified on WhatsApp.",
    price: 2700,
    originalPrice: 3000,
    category: "Gift Cards",
    badge: "Sale",
    image: "https://images.unsplash.com/photo-1612287230202-1bf1d85d1bdf?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  },
  {
    name: "Valorant 1000 VP Code",
    description: "Riot Points pin code for instant redemption. Get 1000 Valorant Points to unlock premium skins, battlepass, and agents. Fast and secure delivery via WhatsApp.",
    price: 1150,
    originalPrice: 1300,
    category: "Game Topups",
    badge: "Hot",
    image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  },
  {
    name: "ChotuBot Companion Robot",
    description: "Meet ChotuBot, your pocket-sized desktop buddy! He walks, reacts, displays cute custom expressions on his LED eyes, and keeps you company during long working or gaming hours.",
    price: 9499,
    originalPrice: 11999,
    category: "Companion Gadgets",
    badge: "New",
    image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  },
  {
    name: "RGB Cyberpunk Desk Mat",
    description: "Waterproof, large-sized (900x400mm) gaming mat featuring stitched borders, customizable RGB neon backlighting (14 modes), and a high-accuracy micro-weave cloth surface.",
    price: 1800,
    originalPrice: 2400,
    category: "General",
    badge: "Sale",
    image: "https://images.unsplash.com/photo-1616440347437-b1c73416efc2?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  },
  {
    name: "PUBG Mobile 660 UC Topup",
    description: "Add 660 Unknown Cash instantly to your PUBG account by providing your character ID. Simple verification process - contact us, pay, and receive UC inside the game within minutes.",
    price: 1399,
    originalPrice: 1550,
    category: "Game Topups",
    badge: "",
    image: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  },
  {
    name: "Netflix 1-Month Premium Pin",
    description: "Original Netflix subscription voucher for 1 month of Ultra HD streaming on up to 4 screens simultaneously. 100% private profile, zero password sharing conflicts.",
    price: 499,
    originalPrice: 650,
    category: "Gift Cards",
    badge: "Hot",
    image: "https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  }
];

async function seedDatabase() {
  try {
    console.log(`Connecting to MongoDB...`);
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB.');

    // Clear existing products
    console.log('Clearing existing products...');
    await Product.deleteMany({});
    console.log('Cleared existing products.');

    // Insert new products
    console.log('Seeding sample products...');
    await Product.insertMany(sampleProducts);
    console.log('Successfully seeded database with products!');
    
    mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err.message);
    process.exit(1);
  }
}

seedDatabase();
