const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === 'production';

// ============= VALIDATE REQUIRED SECRETS =============

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be set in .env and be at least 32 characters.');
  console.error('Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
if (!GOOGLE_CLIENT_ID) {
  console.error('FATAL: GOOGLE_CLIENT_ID must be set in .env');
  process.exit(1);
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  console.error('FATAL: ADMIN_PASSWORD must be set in .env and be at least 8 characters.');
  process.exit(1);
}

// Allowed CORS origins
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5000,http://127.0.0.1:5500,http://localhost:5500').split(',').map(s => s.trim());

// Frontend URL (for redirects)
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:5500';

// ============= REQUEST LOGGING =============

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms - ${ip}`);
  });
  next();
}

// ============= INPUT SANITIZER =============

function sanitizeInput(val) {
  if (typeof val === 'string') {
    return val.replace(/[<>]/g, '').trim();
  }
  return val;
}

function sanitizeObject(obj, fields) {
  const result = {};
  for (const key of fields) {
    if (obj[key] !== undefined) {
      result[key] = sanitizeInput(obj[key]);
    }
  }
  return result;
}

// ============= BRUTE FORCE PROTECTION =============

const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

function checkBruteForce(username) {
  if (!username) return false;
  const key = username.toLowerCase();
  const record = loginAttempts.get(key);
  if (!record) return false;
  if (Date.now() - record.firstAttempt > LOCKOUT_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return record.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedAttempt(username) {
  if (!username) return;
  const key = username.toLowerCase();
  const record = loginAttempts.get(key) || { count: 0, firstAttempt: Date.now() };
  record.count++;
  if (record.count === 1) record.firstAttempt = Date.now();
  loginAttempts.set(key, record);
}

function clearFailedAttempts(username) {
  if (!username) return;
  loginAttempts.delete(username.toLowerCase());
}

// Clean up old entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts.entries()) {
    if (now - record.firstAttempt > LOCKOUT_WINDOW_MS) {
      loginAttempts.delete(key);
    }
  }
}, 30 * 60 * 1000);

// ============= DIRECTORY SETUP =============

const uploadDir = path.join(__dirname, '..', 'frontend', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ============= MONGODB CONNECTION =============

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://alexpluxury2_db_user:alex9012@cluster0.wbwdgff.mongodb.net/?appName=Cluster0';
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB.');
    // Backfill slugs for existing products
    try {
      const slugless = await Product.find({ slug: { $exists: false } });
      for (const p of slugless) {
        await ensureSlug(p);
        await p.save();
      }
      if (slugless.length) console.log(`Backfilled slugs for ${slugless.length} products.`);
    } catch (err) {
      console.error('Slug backfill error:', err.message);
    }
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

// ============= DATABASE SCHEMAS =============

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
  password: { type: String, required: true },
  role: { type: String, default: 'admin', enum: ['admin'] },
  createdAt: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, maxlength: 2000 },
  price: { type: Number, required: true, min: 0 },
  originalPrice: { type: Number, min: 0 },
  image: { type: String, required: true, maxlength: 500 },
  gallery: { type: [String], default: [] },
  video: { type: String, default: '', maxlength: 500 },
  slug: { type: String, unique: true, sparse: true },
  category: { type: String, default: 'General', maxlength: 100 },
  badge: { type: String, default: '', maxlength: 50 },
  featured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

function generateSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product';
}

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  customerName: { type: String, required: true, maxlength: 200 },
  customerPhone: { type: String, required: true, maxlength: 50 },
  customerEmail: { type: String, maxlength: 200 },
  customerAddress: { type: String, required: true, maxlength: 500 },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String, required: true, maxlength: 200 },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    total: { type: Number, required: true, min: 0 }
  }],
  subtotal: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  grandTotal: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, enum: ['Pending', 'Cash', 'Online'], default: 'Pending' },
  status: { type: String, enum: ['Pending', 'In Transit', 'Delivered', 'Cancelled'], default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'contact_info', unique: true },
  whatsapp: { type: String, default: '', maxlength: 50 },
  discord: { type: String, default: '', maxlength: 200 },
  instagram: { type: String, default: '', maxlength: 100 },
  youtube: { type: String, default: '', maxlength: 200 },
  showWhatsapp: { type: Boolean, default: true },
  showInstagram: { type: Boolean, default: true },
  showDiscord: { type: Boolean, default: true },
  showYoutube: { type: Boolean, default: true },
  customMessage: { type: String, default: '', maxlength: 1000 },
  qrCode: { type: String, default: '', maxlength: 500 }
});

productSchema.index({ createdAt: -1 });
productSchema.index({ category: 1 });
categorySchema.index({ order: 1 });
invoiceSchema.index({ createdAt: -1 });

const Admin = mongoose.model('Admin', adminSchema);
const Product = mongoose.model('Product', productSchema);

async function ensureSlug(product) {
  if (product.slug) return;
  let slug = generateSlug(product.name);
  let count = 0;
  while (await Product.findOne({ slug, _id: { $ne: product._id } })) {
    count++;
    slug = generateSlug(product.name) + '-' + count;
  }
  product.slug = slug;
}

const Invoice = mongoose.model('Invoice', invoiceSchema);
const Category = mongoose.model('Category', categorySchema);
const Settings = mongoose.model('Settings', settingsSchema);

const paymentSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, unique: true },
  paymentId: { type: String, required: true, unique: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName: { type: String, required: true, maxlength: 200 },
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending', 'success', 'failed', 'cancelled', 'expired'], default: 'pending' },
  refId: { type: String, default: '' },
  invoiceNumber: { type: String, default: '' },
  customerName: { type: String, default: '', maxlength: 200 },
  customerPhone: { type: String, default: '', maxlength: 50 },
  customerEmail: { type: String, default: '', maxlength: 200 },
  createdAt: { type: Date, default: Date.now }
});

const Payment = mongoose.model('Payment', paymentSchema);

// ============= USER SCHEMA (Google OAuth) =============

const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  name: { type: String, required: true, maxlength: 200 },
  email: { type: String, required: true, unique: true, maxlength: 200 },
  profilePicture: { type: String, default: '', maxlength: 500 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  lastLogin: { type: Date },
  orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ============= CART SCHEMA =============

const cartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true, maxlength: 200 },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, default: 1, min: 1 },
    image: { type: String, default: '', maxlength: 500 }
  }],
  updatedAt: { type: Date, default: Date.now }
});

const Cart = mongoose.model('Cart', cartSchema);

// ============= ORDER SCHEMA =============

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productName: { type: String, required: true, maxlength: 200 },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, default: 1, min: 1 },
    image: { type: String, default: '', maxlength: 500 }
  }],
  totalAmount: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, enum: ['Cash', 'Pending'], default: 'Pending' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'cash_on_delivery'], default: 'pending' },
  transactionId: { type: String, default: '', maxlength: 200 },
  shippingAddress: { type: String, default: '', maxlength: 500 },
  shippingCity: { type: String, default: '', maxlength: 100 },
  customerEmail: { type: String, default: '', maxlength: 200 },
  customerName: { type: String, default: '', maxlength: 200 },
  trackingNumber: { type: String, default: '', maxlength: 200 },
  shippingStatus: { type: String, enum: ['yet_to_pack', 'packed', 'shipped', 'delivered'], default: 'yet_to_pack' },
  paymentDeadline: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

orderSchema.index({ createdAt: -1 });
orderSchema.index({ userId: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);

// ============= CHAT ROOMS & MESSAGES =============

const chatRoomSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastMessage: { type: String, default: '', maxlength: 200 },
  lastMessageAt: { type: Date },
  lastSenderName: { type: String, default: '', maxlength: 100 },
  repliedByAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
chatRoomSchema.index({ userId: 1 }, { unique: true });
chatRoomSchema.index({ updatedAt: -1 });

const messageSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  senderName: { type: String, required: true, maxlength: 100 },
  text: { type: String, required: true, maxlength: 1000 },
  isAdmin: { type: Boolean, default: false },
  readAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});
messageSchema.index({ roomId: 1, createdAt: 1 });
messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);
const Message = mongoose.model('Message', messageSchema);

// ============= GOOGLE AUTH CLIENT =============

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ============= USER JWT MIDDLEWARE =============

const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

// ============= SECURITY MIDDLEWARES =============

app.use(requestLogger);

// CORS - restrict to allowed origins
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Helmet with strict CSP (no unsafe-inline for scripts)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://accounts.google.com", "https://*.gstatic.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://accounts.google.com", "https://*.gstatic.com", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://oauth2.googleapis.com"],
      frameSrc: ["'self'", "https://accounts.google.com", "https://*.gstatic.com"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));



// Block direct access to sensitive files
app.use((req, res, next) => {
  const blocked = ['/.env', '/.env.example', '/package.json', '/package-lock.json', '/seed.js', '/reset-db.js', '/../.env', '/../.env.example'];
  if (blocked.includes(req.path) || req.path.startsWith('/node_modules/') || req.path.startsWith('/..')) {
    return res.status(404).send('Not found');
  }
  next();
});

// NoSQL injection protection
app.use(mongoSanitize());

// General API rate limiter
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' }
}));

// Strict admin login rate limiter (per IP)
app.use('/api/admin/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' }
}));

// Rate limiter for user auth endpoints
app.use('/api/auth/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' }
}));

// Body parsers with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

// Serve uploads from shared frontend directory
app.use('/uploads', express.static(uploadDir));

// JWT Admin Auth Middleware (supports both httpOnly cookie and Bearer header)
const authenticateAdmin = (req, res, next) => {
  let token = req.cookies.admin_token;
  const authHeader = req.headers.authorization;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }
  if (!token) return res.status(401).json({ error: 'Access denied. Please log in.' });
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.admin = verified;
    next();
  } catch {
    if (req.cookies.admin_token) res.clearCookie('admin_token');
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
};

// Multer for image uploads with strict validation
const ALLOWED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXTENSIONS = ['.jpeg', '.jpg', '.png', '.webp', '.gif'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIMES.includes(file.mimetype) && ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed (jpeg, jpg, png, webp, gif)'));
  }
});

// Password strength validator
function isPasswordStrong(password) {
  if (!password || password.length < 8) return false;
  let strength = 0;
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;
  return strength >= 3;
}

// ============= SEED DEFAULTS =============

async function seedDefaults() {
  try {
    const existingSettings = await Settings.findOne({ key: 'contact_info' });
    if (!existingSettings) {
      await Settings.create({ key: 'contact_info' });
      console.log('Seeded default contact settings.');
    }
    const existingCategories = await Category.countDocuments();
    if (existingCategories === 0) {
      const defaults = ['Gift Cards', 'Game Topups', 'Companion Gadgets', 'General'];
      await Category.insertMany(defaults.map((name, i) => ({ name, order: i })));
      console.log(`Seeded ${defaults.length} default categories.`);
    }
    const hasDefaultAdmin = await Admin.findOne({ username: 'admin' });
    if (!hasDefaultAdmin) {
      if (!isPasswordStrong(ADMIN_PASSWORD)) {
        console.warn('WARNING: ADMIN_PASSWORD is weak. Creating admin anyway for development.');
        console.warn('  Set a stronger password in .env (lowercase + uppercase + digit/special, min 8 chars).');
      }
      const hashed = await bcrypt.hash(ADMIN_PASSWORD, 12);
      await Admin.create({ username: 'admin', password: hashed });
      console.log('Seeded default admin: "admin"');
    }
  } catch (err) {
    console.error('Seed error:', err.message);
  }
}
mongoose.connection.once('open', seedDefaults);

// ============= PASSWORD HELPER =============

function passwordError(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  let strength = 0;
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;
  if (strength < 3) return 'Password must contain at least 3 of: lowercase, uppercase, digits, special characters.';
  return null;
}

// ============= GOOGLE OAUTH API =============

app.get('/api/auth/config', (req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID,
    frontendUrl: FRONTEND_URL
  });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Google credential required.' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, name, email, picture } = payload;

    if (!email) {
      return res.status(400).json({ error: 'Email required from Google account.' });
    }

    let user = await User.findOne({ googleId });
    if (!user) {
      user = new User({ googleId, name, email, profilePicture: picture || '' });
    } else {
      user.name = name;
      user.email = email;
      user.profilePicture = picture || user.profilePicture;
    }
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id.toString(), googleId: user.googleId, email: user.email, role: user.role || 'user' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: 'Google authentication failed.' });
  }
});

app.get('/api/auth/me', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-__v');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// ============= ORDER API (USER) =============

// Create order (must be logged in)
app.post('/api/orders', authenticateUser, async (req, res) => {
  try {
    const { items, paymentMethod } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ error: 'Items required.' });
    }

    let totalAmount = 0;
    const processedItems = items.map(item => {
      const price = parseFloat(item.price) || 0;
      const qty = parseInt(item.quantity) || 1;
      if (price <= 0) throw new Error('Invalid price');
      totalAmount += price * qty;
      return {
        productName: String(item.productName || '').slice(0, 200),
        price,
        quantity: qty
      };
    });

    const order = new Order({
      userId: req.user.id,
      items: processedItems,
      totalAmount,
      paymentMethod: ['Cash', 'Pending'].includes(paymentMethod) ? paymentMethod : 'Pending',
      paymentStatus: 'pending'
    });
    await order.save();

    // Add order reference to user
    await User.findByIdAndUpdate(req.user.id, { $push: { orders: order._id } });

    res.status(201).json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message === 'Invalid price' ? 'Invalid item data' : 'Failed to create order.' });
  }
});

// Get my orders
app.get('/api/orders/my', authenticateUser, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

// ============= CART API =============

// Get user's cart
app.get('/api/cart', authenticateUser, async (req, res) => {
  try {
    let cart = await Cart.findOne({ userId: req.user.id }).lean();
    if (!cart) cart = { items: [] };
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load cart.' });
  }
});

// Add item to cart
app.post('/api/cart/add', authenticateUser, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId) return res.status(400).json({ error: 'Product ID required.' });
    if (!mongoose.Types.ObjectId.isValid(productId)) return res.status(400).json({ error: 'Invalid product ID.' });

    const product = await Product.findById(productId).lean();
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    let cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) {
      cart = new Cart({ userId: req.user.id, items: [] });
    }

    const existingIdx = cart.items.findIndex(item => item.product.toString() === productId);
    const qty = parseInt(quantity) || 1;

    if (existingIdx > -1) {
      cart.items[existingIdx].quantity += qty;
    } else {
      cart.items.push({
        product: product._id,
        productName: product.name,
        price: product.price,
        quantity: qty,
        image: product.image || ''
      });
    }

    cart.updatedAt = new Date();
    await cart.save();
    res.json({ success: true, cart });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add to cart.' });
  }
});

// Update cart item quantity
app.put('/api/cart/item/:productId', authenticateUser, async (req, res) => {
  try {
    const { quantity } = req.body;
    const qty = parseInt(quantity);
    if (!qty || qty < 0) return res.status(400).json({ error: 'Invalid quantity.' });

    let cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) return res.status(404).json({ error: 'Cart not found.' });

    const idx = cart.items.findIndex(item => item.product.toString() === req.params.productId);
    if (idx === -1) return res.status(404).json({ error: 'Item not in cart.' });

    if (qty === 0) {
      cart.items.splice(idx, 1);
    } else {
      cart.items[idx].quantity = qty;
    }

    cart.updatedAt = new Date();
    await cart.save();
    res.json({ success: true, cart });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update cart.' });
  }
});

// Remove item from cart
app.delete('/api/cart/item/:productId', authenticateUser, async (req, res) => {
  try {
    let cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) return res.status(404).json({ error: 'Cart not found.' });

    cart.items = cart.items.filter(item => item.product.toString() !== req.params.productId);
    cart.updatedAt = new Date();
    await cart.save();
    res.json({ success: true, cart });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove item.' });
  }
});

// Clear cart
app.delete('/api/cart', authenticateUser, async (req, res) => {
  try {
    await Cart.findOneAndDelete({ userId: req.user.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear cart.' });
  }
});

// ============= CHECKOUT API =============

// Checkout - create order from cart
app.post('/api/checkout', authenticateUser, async (req, res) => {
  try {
    const { shippingAddress, shippingCity, customerEmail, customerName, paymentMethod } = req.body;
    if (!shippingAddress || !shippingCity || !customerEmail || !customerName) {
      return res.status(400).json({ error: 'Shipping details required.' });
    }

    const cart = await Cart.findOne({ userId: req.user.id });
    if (!cart || !cart.items.length) {
      return res.status(400).json({ error: 'Cart is empty.' });
    }

    let totalAmount = 0;
    const processedItems = cart.items.map(item => {
      const price = item.price || 0;
      const qty = item.quantity || 1;
      totalAmount += price * qty;
      return {
        product: item.product,
        productName: item.productName,
        price,
        quantity: qty,
        image: item.image || ''
      };
    });

    const payMethod = ['Cash', 'Pending'].includes(paymentMethod) ? paymentMethod : 'Pending';

    const orderData = {
      userId: req.user.id,
      items: processedItems,
      totalAmount,
      paymentMethod: payMethod,
      paymentStatus: payMethod === 'Cash' ? 'cash_on_delivery' : 'pending',
      shippingAddress: String(shippingAddress).slice(0, 500),
      shippingCity: String(shippingCity).slice(0, 100),
      customerEmail: String(customerEmail).slice(0, 200),
      customerName: String(customerName).slice(0, 200),
      shippingStatus: 'yet_to_pack'
    };

    const order = new Order(orderData);
    await order.save();

    // Add order reference to user
    await User.findByIdAndUpdate(req.user.id, { $push: { orders: order._id } });

    // Clear cart
    await Cart.findOneAndDelete({ userId: req.user.id });

    res.status(201).json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: 'Checkout failed.' });
  }
});

// Pay Now - initiate payment for pending order
app.post('/api/orders/pay-now/:orderId', authenticateUser, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.orderId)) {
      return res.status(400).json({ error: 'Invalid order ID.' });
    }
    const order = await Order.findOne({ _id: req.params.orderId, userId: req.user.id });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.paymentStatus !== 'pending') {
      return res.status(400).json({ error: 'Order is not pending payment.' });
    }
    // Check deadline
    if (order.paymentDeadline && new Date() > order.paymentDeadline) {
      order.paymentStatus = 'failed';
      await order.save();
      return res.status(400).json({ error: 'Payment deadline has passed.' });
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process pay request.' });
  }
});

// ============= ADMIN API (USERS & ORDERS) =============

// List all users (admin only)
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    const users = await User.find(query).sort({ createdAt: -1 }).select('-googleId -__v').lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

// List all orders with filters (admin only)
app.get('/api/admin/orders', authenticateAdmin, async (req, res) => {
  try {
    const { userId, paymentStatus, shippingStatus, search } = req.query;
    let query = {};
    if (userId) query.userId = userId;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (shippingStatus) query.shippingStatus = shippingStatus;

    const orders = await Order.find(query)
      .populate('userId', 'name email googleId profilePicture')
      .sort({ createdAt: -1 })
      .lean();

    // Client-side search by customer email/name
    let filtered = orders;
    if (search) {
      const lower = search.toLowerCase();
      filtered = orders.filter(o =>
        (o.userId?.name || '').toLowerCase().includes(lower) ||
        (o.userId?.email || '').toLowerCase().includes(lower) ||
        (o.customerName || '').toLowerCase().includes(lower) ||
        (o.trackingNumber || '').toLowerCase().includes(lower)
      );
    }

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});

// Update order tracking/shipping (admin only)
app.put('/api/admin/orders/:id', authenticateAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid order ID.' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const { trackingNumber, shippingStatus, paymentStatus } = req.body;

    if (trackingNumber !== undefined) {
      order.trackingNumber = String(trackingNumber).slice(0, 200);
    }
    if (shippingStatus && ['yet_to_pack', 'packed', 'shipped', 'delivered'].includes(shippingStatus)) {
      order.shippingStatus = shippingStatus;
    }
    if (paymentStatus && ['pending', 'paid', 'failed', 'cash_on_delivery'].includes(paymentStatus)) {
      order.paymentStatus = paymentStatus;
    }

    await order.save();
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order.' });
  }
});

// ============= AUTH API (ADMIN) =============

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

    const cleanUsername = String(username).trim().toLowerCase();

    // Check brute force
    if (checkBruteForce(cleanUsername)) {
      return res.status(429).json({ error: 'Account temporarily locked. Try again in 15 minutes.' });
    }

    const admin = await Admin.findOne({ username: cleanUsername });
    if (!admin) {
      recordFailedAttempt(cleanUsername);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(String(password), admin.password);
    if (!isMatch) {
      recordFailedAttempt(cleanUsername);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Success - clear attempts
    clearFailedAttempts(cleanUsername);

    const token = jwt.sign(
      { id: admin._id.toString(), username: admin.username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '4h' }
    );
    res.cookie('admin_token', token, {
      httpOnly: true,
      maxAge: 4 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: isProd,
      path: '/'
    });
    res.json({ success: true, message: 'Logged in.', username: admin.username, token });
  } catch (err) {
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_token', { path: '/' });
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
  let token = req.cookies.admin_token;
  const authHeader = req.headers.authorization;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }
  if (!token) return res.json({ authenticated: false });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ authenticated: true, username: decoded.username });
  } catch {
    if (req.cookies.admin_token) res.clearCookie('admin_token', { path: '/' });
    res.json({ authenticated: false });
  }
});

// Change own credentials
app.post('/api/admin/change-credentials', authenticateAdmin, async (req, res) => {
  try {
    const { currentPassword, newUsername, newPassword } = req.body;
    if (!currentPassword || !newUsername || !newPassword)
      return res.status(400).json({ error: 'All fields required.' });

    const username = sanitizeInput(String(newUsername));
    if (username.length < 3 || username.length > 30)
      return res.status(400).json({ error: 'Username must be 3-30 characters.' });

    const pwError = passwordError(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });

    const admin = await Admin.findById(req.admin.id);
    if (!admin) return res.status(404).json({ error: 'Admin not found.' });

    const isMatch = await bcrypt.compare(String(currentPassword), admin.password);
    if (!isMatch) return res.status(400).json({ error: 'Current password is incorrect.' });

    const existing = await Admin.findOne({ username, _id: { $ne: admin._id } });
    if (existing) return res.status(400).json({ error: 'Username already taken.' });

    admin.username = username;
    admin.password = await bcrypt.hash(newPassword, 12);
    await admin.save();

    res.clearCookie('admin_token', { path: '/' });
    res.json({ success: true, message: 'Credentials updated. Please re-login.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update credentials.' });
  }
});

// ============= MULTI-ADMIN MANAGEMENT =============

app.get('/api/admin/accounts', authenticateAdmin, async (req, res) => {
  try {
    const admins = await Admin.find().select('username role createdAt -_id');
    res.json({ admins, maxAccounts: 5 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load admin accounts.' });
  }
});

app.post('/api/admin/accounts', authenticateAdmin, async (req, res) => {
  try {
    const count = await Admin.countDocuments();
    if (count >= 5) return res.status(400).json({ error: 'Maximum 5 admin accounts allowed.' });

    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

    const cleanUsername = sanitizeInput(String(username));
    if (cleanUsername.length < 3 || cleanUsername.length > 30)
      return res.status(400).json({ error: 'Username must be 3-30 characters.' });

    const pwError = passwordError(password);
    if (pwError) return res.status(400).json({ error: pwError });

    const exists = await Admin.findOne({ username: cleanUsername });
    if (exists) return res.status(400).json({ error: 'Username already exists.' });

    const hashed = await bcrypt.hash(String(password), 12);
    await Admin.create({ username: cleanUsername, password: hashed });
    res.status(201).json({ success: true, message: `Admin created.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create admin account.' });
  }
});

app.delete('/api/admin/accounts/:username', authenticateAdmin, async (req, res) => {
  try {
    const count = await Admin.countDocuments();
    if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last admin account.' });

    if (req.admin.username === req.params.username) {
      return res.status(400).json({ error: 'Cannot delete your own account.' });
    }

    const deleted = await Admin.findOneAndDelete({ username: req.params.username });
    if (!deleted) return res.status(404).json({ error: 'Admin not found.' });
    res.json({ success: true, message: 'Admin deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete admin account.' });
  }
});

// ============= SETTINGS API =============

app.get('/api/settings', async (req, res) => {
  try {
    let settings = await Settings.findOne({ key: 'contact_info' });
    if (!settings) settings = { whatsapp: '', discord: '', instagram: '', youtube: '', showWhatsapp: true, showInstagram: true, showDiscord: true, showYoutube: true, customMessage: '', qrCode: '' };
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

app.post('/api/settings', authenticateAdmin, async (req, res) => {
  try {
    const { whatsapp, discord, instagram, youtube, showWhatsapp, showInstagram, showDiscord, showYoutube, customMessage, qrCode } = req.body;
    let settings = await Settings.findOne({ key: 'contact_info' });
    if (!settings) settings = new Settings({ key: 'contact_info' });
    settings.whatsapp = String(whatsapp || '').slice(0, 50);
    settings.discord = String(discord || '').slice(0, 200);
    settings.instagram = String(instagram || '').slice(0, 100);
    settings.youtube = String(youtube || '').slice(0, 200);
    settings.showWhatsapp = showWhatsapp === true || showWhatsapp === 'true';
    settings.showInstagram = showInstagram === true || showInstagram === 'true';
    settings.showDiscord = showDiscord === true || showDiscord === 'true';
    settings.showYoutube = showYoutube === true || showYoutube === 'true';
    settings.customMessage = String(customMessage || '').slice(0, 1000);
    settings.qrCode = String(qrCode || '').slice(0, 500);
    await settings.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings.' });
  }
});

// ============= CATEGORIES API =============

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await Category.find().sort({ order: 1, name: 1 }).lean();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load categories.' });
  }
});

app.post('/api/categories', authenticateAdmin, async (req, res) => {
  try {
    const { name, order } = req.body;
    const clean = String(name || '').trim().slice(0, 100);
    if (!clean) return res.status(400).json({ error: 'Category name is required.' });
    const existing = await Category.findOne({ name: clean });
    if (existing) return res.status(400).json({ error: 'Category already exists.' });
    const category = await Category.create({ name: clean, order: Number(order) || 0 });
    res.json({ success: true, category });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

app.put('/api/categories/:id', authenticateAdmin, async (req, res) => {
  try {
    const { name, order } = req.body;
    const clean = String(name || '').trim().slice(0, 100);
    if (!clean) return res.status(400).json({ error: 'Category name is required.' });
    const dup = await Category.findOne({ name: clean, _id: { $ne: req.params.id } });
    if (dup) return res.status(400).json({ error: 'Category name already exists.' });
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name: clean, order: Number(order) || 0 },
      { new: true }
    );
    if (!category) return res.status(404).json({ error: 'Category not found.' });
    res.json({ success: true, category });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update category.' });
  }
});

app.delete('/api/categories/:id', authenticateAdmin, async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found.' });
    res.json({ success: true, message: 'Category deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete category.' });
  }
});

// ============= PRODUCTS API =============

app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 }).lean();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load products.' });
  }
});

app.get('/api/products/featured', async (req, res) => {
  try {
    let featured = await Product.find({ featured: true }).sort({ createdAt: -1 }).limit(5).lean();
    if (!featured.length) {
      featured = await Product.find().sort({ createdAt: -1 }).limit(5).lean();
    }
    res.json(featured);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load featured products.' });
  }
});

app.get('/api/products/slug/:slug', async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug }).lean();
    if (!product) return res.status(404).json({ error: 'Not found.' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load product.' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid product ID.' });
    }
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ error: 'Not found.' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load product.' });
  }
});

app.post('/api/products', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, price, originalPrice, image, gallery, video, category, badge, featured } = req.body;
    if (!name || !description || price === undefined || !image)
      return res.status(400).json({ error: 'Required fields missing.' });

    const clean = sanitizeObject(req.body, ['name', 'description', 'image', 'gallery', 'video', 'category', 'badge']);
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) return res.status(400).json({ error: 'Invalid price.' });

    const product = new Product({
      name: String(clean.name || '').slice(0, 200),
      description: String(clean.description || '').slice(0, 2000),
      image: String(clean.image || '').slice(0, 500),
      gallery: Array.isArray(gallery) ? gallery.map(g => String(g).slice(0, 500)).filter(Boolean) : [],
      video: String(clean.video || '').slice(0, 500),
      price: parsedPrice,
      originalPrice: originalPrice ? parseFloat(originalPrice) : null,
      category: String(clean.category || 'General').slice(0, 100),
      badge: String(clean.badge || '').slice(0, 50),
      featured: featured === true || featured === 'true'
    });

    if (!product.name || !product.description || !product.image) {
      return res.status(400).json({ error: 'Required fields cannot be empty.' });
    }

    // Validate image URL is not a local path traversal
    if (product.image.startsWith('/uploads/')) {
      const resolvedPath = path.resolve(path.join(__dirname, '..', 'frontend', product.image));
      if (!resolvedPath.startsWith(path.resolve(uploadDir))) {
        return res.status(400).json({ error: 'Invalid image path.' });
      }
    }

    await ensureSlug(product);
    await product.save();
    res.status(201).json({ success: true, product });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save product.' });
  }
});

app.put('/api/products/:id', authenticateAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid product ID.' });
    }
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Not found.' });

    const { name, description, price, originalPrice, image, gallery, video, category, badge, featured } = req.body;

    if (name !== undefined) product.name = String(name).slice(0, 200);
    if (description !== undefined) product.description = String(description).slice(0, 2000);
    if (price !== undefined) {
      const p = parseFloat(price);
      if (isNaN(p) || p < 0) return res.status(400).json({ error: 'Invalid price.' });
      product.price = p;
    }
    if (originalPrice !== undefined) product.originalPrice = originalPrice ? parseFloat(originalPrice) : null;
    if (image !== undefined) product.image = String(image).slice(0, 500);
    if (gallery !== undefined) product.gallery = Array.isArray(gallery) ? gallery.map(g => String(g).slice(0, 500)).filter(Boolean) : [];
    if (video !== undefined) product.video = String(video).slice(0, 500);
    if (category !== undefined) product.category = String(category).slice(0, 100);
    if (badge !== undefined) product.badge = String(badge).slice(0, 50);
    if (featured !== undefined) product.featured = featured === true || featured === 'true';

    await ensureSlug(product);
    await product.save();
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product.' });
  }
});

app.delete('/api/products/:id', authenticateAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid product ID.' });
    }
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Not found.' });

    // Safely delete associated file
    if (product.image && product.image.startsWith('/uploads/')) {
      const resolvedPath = path.resolve(path.join(__dirname, '..', 'frontend', product.image));
      if (resolvedPath.startsWith(path.resolve(uploadDir))) {
        try { if (fs.existsSync(resolvedPath)) fs.unlinkSync(resolvedPath); } catch {}
      }
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

// ============= INVOICES API =============

app.get('/api/invoices', authenticateAdmin, async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 }).lean();
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load invoices.' });
  }
});

app.post('/api/invoices', authenticateAdmin, async (req, res) => {
  try {
    const { customerName, customerPhone, customerEmail, customerAddress, items, discount, paymentMethod, status } = req.body;
    if (!customerName || !customerPhone || !customerAddress || !items || !items.length)
      return res.status(400).json({ error: 'Missing required fields.' });

    let subtotal = 0;
    const processed = items.map(item => {
      const price = parseFloat(item.price) || 0;
      const qty = parseInt(item.quantity) || 0;
      if (price < 0 || qty < 1) throw new Error('Invalid item data');
      const lineTotal = price * qty;
      subtotal += lineTotal;
      return {
        product: mongoose.Types.ObjectId.isValid(item.product) ? item.product : null,
        name: String(item.name || '').slice(0, 200),
        price,
        quantity: qty,
        total: lineTotal
      };
    });

    const disc = Math.max(0, parseFloat(discount) || 0);
    const grandTotal = Math.max(0, subtotal - disc);

    const year = new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);
    const count = await Invoice.countDocuments({ createdAt: { $gte: startOfYear, $lte: endOfYear } });
    const invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;

    const invoice = new Invoice({
      invoiceNumber,
      customerName: String(customerName).slice(0, 200),
      customerPhone: String(customerPhone).slice(0, 50),
      customerEmail: String(customerEmail || '').slice(0, 200),
      customerAddress: String(customerAddress).slice(0, 500),
      items: processed,
      subtotal, discount: disc, grandTotal,
      paymentMethod: ['Pending', 'Cash', 'Online'].includes(paymentMethod) ? paymentMethod : 'Pending',
      status: ['Pending', 'In Transit', 'Delivered', 'Cancelled'].includes(status) ? status : 'Pending'
    });
    await invoice.save();
    res.status(201).json({ success: true, invoice });
  } catch (err) {
    res.status(500).json({ error: err.message === 'Invalid item data' ? 'Invalid item data' : 'Failed to create invoice.' });
  }
});

app.put('/api/invoices/:id', authenticateAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid invoice ID.' });
    }
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Not found.' });

    const { customerName, customerPhone, customerEmail, customerAddress, items, discount, paymentMethod, status } = req.body;

    if (customerName) invoice.customerName = String(customerName).slice(0, 200);
    if (customerPhone) invoice.customerPhone = String(customerPhone).slice(0, 50);
    if (customerEmail !== undefined) invoice.customerEmail = String(customerEmail).slice(0, 200);
    if (customerAddress) invoice.customerAddress = String(customerAddress).slice(0, 500);
    if (paymentMethod && ['Pending', 'Cash', 'Online'].includes(paymentMethod)) invoice.paymentMethod = paymentMethod;
    if (status && ['Pending', 'In Transit', 'Delivered', 'Cancelled'].includes(status)) invoice.status = status;

    if (items && items.length) {
      let subtotal = 0;
      invoice.items = items.map(item => {
        const price = parseFloat(item.price) || 0;
        const qty = parseInt(item.quantity) || 0;
        const t = price * qty;
        subtotal += t;
        return {
          product: mongoose.Types.ObjectId.isValid(item.product) ? item.product : null,
          name: String(item.name || '').slice(0, 200),
          price, quantity: qty, total: t
        };
      });
      invoice.subtotal = subtotal;
    }
    if (discount !== undefined) invoice.discount = Math.max(0, parseFloat(discount) || 0);
    invoice.grandTotal = Math.max(0, invoice.subtotal - invoice.discount);
    await invoice.save();
    res.json({ success: true, invoice });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update invoice.' });
  }
});

app.delete('/api/invoices/:id', authenticateAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid invoice ID.' });
    }
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Not found.' });
    await Invoice.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete invoice.' });
  }
});

// ============= PAYMENT STATUS =============
// Get payment status
app.get('/api/payment/status/:transactionId', async (req, res) => {
  try {
    const payment = await Payment.findOne({ transactionId: req.params.transactionId }).lean();
    if (!payment) return res.status(404).json({ error: 'Transaction not found.' });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payment status.' });
  }
});

// List all payments (admin)
app.get('/api/payments', authenticateAdmin, async (req, res) => {
  try {
    const payments = await Payment.find().sort({ createdAt: -1 }).lean();
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load payments.' });
  }
});

// ============= FILE UPLOAD =============

app.post('/api/upload', authenticateAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  res.json({ success: true, url: `/uploads/${req.file.filename}` });
});

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Max 5MB.' });
    return res.status(400).json({ error: err.message });
  }
  if (err.message && err.message.includes('Only image')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// ============= MISC ROUTES =============

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /admin\nDisallow: /admin-login\nDisallow: /api/\n');
});

// ============= CHAT API =============

// Create or get existing chat room for the current user
app.post('/api/chat/create', authenticateUser, async (req, res) => {
  try {
    let room = await ChatRoom.findOne({ userId: req.user.id });
    if (!room) {
      room = new ChatRoom({
        userId: req.user.id,
        lastMessage: 'Chat started',
        lastMessageAt: new Date(),
        lastSenderName: req.user.name || 'Customer'
      });
      await room.save();
    }
    res.json({ success: true, room });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create chat room.' });
  }
});

// Get user's chat rooms
app.get('/api/chat/my-rooms', authenticateUser, async (req, res) => {
  try {
    const rooms = await ChatRoom.find({ userId: req.user.id })
      .sort({ updatedAt: -1 })
      .lean();
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load rooms.' });
  }
});

// Get messages for a room (user)
app.get('/api/chat/messages/:roomId', authenticateUser, async (req, res) => {
  try {
    const room = await ChatRoom.findOne({ _id: req.params.roomId, userId: req.user.id });
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    const messages = await Message.find({ roomId: req.params.roomId })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();
    // Mark messages as read
    await Message.updateMany(
      { roomId: req.params.roomId, isAdmin: true, readAt: null },
      { readAt: new Date() }
    );
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load messages.' });
  }
});

// Send a message (user)
app.post('/api/chat/send', authenticateUser, async (req, res) => {
  try {
    const { roomId, text } = req.body;
    if (!roomId || !text) return res.status(400).json({ error: 'Room ID and text required.' });
    const msg = await Message.create({
      roomId, senderId: req.user.id, senderName: req.user.name || 'Customer',
      text: String(text).slice(0, 1000), isAdmin: false,
      createdAt: new Date()
    });
    await ChatRoom.findByIdAndUpdate(roomId, {
      lastMessage: String(text).slice(0, 200),
      lastMessageAt: new Date(),
      lastSenderName: req.user.name || 'Customer',
      repliedByAdmin: false,
      updatedAt: new Date()
    });
    // Trim old messages (keep last 100)
    const count = await Message.countDocuments({ roomId });
    if (count > 100) {
      const oldest = await Message.find({ roomId }).sort({ createdAt: 1 }).limit(count - 100).select('_id');
      await Message.deleteMany({ _id: { $in: oldest.map(m => m._id) } });
    }
    res.status(201).json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

// Admin: Get all chat rooms with user info
app.get('/api/admin/chat/rooms', authenticateAdmin, async (req, res) => {
  try {
    const sortOrder = req.query.sort === 'oldest' ? 1 : -1;
    const rooms = await ChatRoom.find()
      .populate('userId', 'name email profilePicture')
      .sort({ updatedAt: sortOrder })
      .lean();
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load chat rooms.' });
  }
});

// Admin: Get messages for a room
app.get('/api/admin/chat/messages/:roomId', authenticateAdmin, async (req, res) => {
  try {
    const messages = await Message.find({ roomId: req.params.roomId })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load messages.' });
  }
});

// Admin: Send a message as admin
app.post('/api/admin/chat/send', authenticateAdmin, async (req, res) => {
  try {
    const { roomId, text } = req.body;
    if (!roomId || !text) return res.status(400).json({ error: 'Room ID and text required.' });
    const room = await ChatRoom.findById(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    const msg = await Message.create({
      roomId, senderId: room.userId, senderName: 'Admin',
      text: String(text).slice(0, 1000), isAdmin: true,
      createdAt: new Date()
    });
    await ChatRoom.findByIdAndUpdate(roomId, {
      lastMessage: String(text).slice(0, 200),
      lastMessageAt: new Date(),
      lastSenderName: 'Admin',
      repliedByAdmin: true,
      updatedAt: new Date()
    });
    res.status(201).json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

// ============= FRONTEND STATIC FILES =============

const frontendDir = path.resolve(__dirname, '..', 'frontend');

const FRONTEND_ROUTES = {
  '/admin-login': 'admin-login.html',
  '/product': 'product.html',
  '/checkout': 'checkout.html',
  '/profile': 'profile.html',
  '/chat': 'chat.html',
};

// Serve static frontend files
app.use(express.static(frontendDir));

// Auth-protected admin route - redirects to login if not authenticated
app.get('/admin', (req, res) => {
  let token = req.cookies.admin_token;
  const authHeader = req.headers.authorization;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }
  if (!token) {
    return res.redirect('/admin-login');
  }
  try {
    jwt.verify(token, JWT_SECRET);
    res.sendFile(path.join(frontendDir, 'admin.html'));
  } catch {
    if (req.cookies.admin_token) res.clearCookie('admin_token', { path: '/' });
    return res.redirect('/admin-login');
  }
});

// Auth-protected admin-login route - redirects to dashboard if already authenticated
app.get('/admin-login', (req, res) => {
  let token = req.cookies.admin_token;
  const authHeader = req.headers.authorization;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      return res.redirect('/admin');
    } catch {
      if (req.cookies.admin_token) res.clearCookie('admin_token', { path: '/' });
    }
  }
  res.sendFile(path.join(frontendDir, 'admin-login.html'));
});

// Route map for pretty URLs (admin excluded - handled above)
app.get(Object.keys(FRONTEND_ROUTES), (req, res) => {
  res.sendFile(path.join(frontendDir, FRONTEND_ROUTES[req.path]));
});

// Slug-based product pages: /any-slug-name -> product.html
app.get(/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/, (req, res) => {
  const filePath = path.join(frontendDir, req.path);
  if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    return res.sendFile(filePath);
  }
  res.sendFile(path.join(frontendDir, 'product.html'));
});

// ============= GLOBAL ERROR HANDLER =============

app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.message);
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  res.status(500).json({ error: 'Internal server error.' });
});

// ============= SERVER START =============

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nServer running on http://0.0.0.0:${PORT}`);
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`Network: http://<YOUR-IP>:${PORT}\n`);
});
