const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://alexpluxury2_db_user:alex9012@cluster0.wbwdgff.mongodb.net/?appName=Cluster0';

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3 },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' },
  createdAt: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  originalPrice: { type: Number },
  image: { type: String, required: true },
  category: { type: String, default: 'General' },
  badge: { type: String, default: '' },
  featured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'contact_info', unique: true },
  whatsapp: { type: String, default: '+9779800000000' },
  phone: { type: String, default: '+9779800000000' },
  instagram: { type: String, default: 'hamrogamingstore' },
  customMessage: { type: String, default: 'Hello! I would like to buy: {product_name} priced at {product_price}. Is it available?' }
});

const Admin = mongoose.model('Admin', adminSchema);
const Product = mongoose.model('Product', productSchema);
const Settings = mongoose.model('Settings', settingsSchema);

const sampleProducts = [
  {
    name: "Steam Wallet Gift Card $20",
    description: "Get instant digital delivery of Steam Wallet codes. Refuel your Steam balance to buy your favorite PC games, DLCs, and software. Quick checkout verified on WhatsApp.",
    price: 2700,
    originalPrice: 3000,
    category: "Gift Cards",
    badge: "Sale",
    featured: true,
    image: "https://images.unsplash.com/photo-1612287230202-1bf1d85d1bdf?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  },
  {
    name: "Valorant 1000 VP Code",
    description: "Riot Points pin code for instant redemption. Get 1000 Valorant Points to unlock premium skins, battlepass, and agents. Fast and secure delivery via WhatsApp.",
    price: 1150,
    originalPrice: 1300,
    category: "Game Topups",
    badge: "Hot",
    featured: true,
    image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  },
  {
    name: "ChotuBot Companion Robot",
    description: "Meet ChotuBot, your pocket-sized desktop buddy! He walks, reacts, displays cute custom expressions on his LED eyes, and keeps you company during long working or gaming hours.",
    price: 9499,
    originalPrice: 11999,
    category: "Companion Gadgets",
    badge: "New",
    featured: true,
    image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  },
  {
    name: "RGB Cyberpunk Desk Mat",
    description: "Waterproof, large-sized (900x400mm) gaming mat featuring stitched borders, customizable RGB neon backlighting (14 modes), and a high-accuracy micro-weave cloth surface.",
    price: 1800,
    originalPrice: 2400,
    category: "General",
    badge: "Sale",
    featured: false,
    image: "https://images.unsplash.com/photo-1616440347437-b1c73416efc2?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  },
  {
    name: "PUBG Mobile 660 UC Topup",
    description: "Add 660 Unknown Cash instantly to your PUBG account by providing your character ID. Simple verification process - contact us, pay, and receive UC inside the game within minutes.",
    price: 1399,
    originalPrice: 1550,
    category: "Game Topups",
    badge: "",
    featured: false,
    image: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  },
  {
    name: "Netflix 1-Month Premium Pin",
    description: "Original Netflix subscription voucher for 1 month of Ultra HD streaming on up to 4 screens simultaneously. 100% private profile, zero password sharing conflicts.",
    price: 499,
    originalPrice: 650,
    category: "Gift Cards",
    badge: "Hot",
    featured: true,
    image: "https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  }
];

async function resetDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    // Drop everything
    console.log('Dropping all collections...');
    await Admin.deleteMany({});
    await Product.deleteMany({});
    await Settings.deleteMany({});
    console.log('All data cleared.');

    // Seed admin
    console.log('Seeding admin account...');
    const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
    await Admin.create({ username: 'admin', password: hashed });
    console.log(`Admin created: "admin" / "${process.env.ADMIN_PASSWORD || 'admin123'}"`);

    // Seed settings
    console.log('Seeding contact settings...');
    await Settings.create({
      key: 'contact_info',
      whatsapp: '+9779800000000',
      phone: '+9779800000000',
      instagram: 'hamrogamingstore',
      customMessage: 'Hello! I would like to buy: {product_name} priced at {product_price}. Is it available?'
    });
    console.log('Contact settings seeded.');

    // Seed products
    console.log('Seeding products...');
    await Product.insertMany(sampleProducts);
    console.log(`${sampleProducts.length} products seeded.`);

    console.log('\n✅ Database reset complete!');
    console.log('   Login: admin / ' + (process.env.ADMIN_PASSWORD || 'admin123'));
    
    mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('Reset failed:', err.message);
    process.exit(1);
  }
}

resetDatabase();
