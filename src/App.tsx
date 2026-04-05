import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ShoppingCart, 
  Package, 
  LayoutDashboard, 
  Settings as SettingsIcon,
  Search,
  Scan,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  History,
  TrendingUp,
  Users,
  DollarSign,
  AlertTriangle,
  Loader2,
  Zap,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Scanner from './components/Scanner';
import Checkout from './components/Checkout';
import { dbService } from './services/dbService';
import { Product, CartItem, AppSettings, Sale } from './types';
import { formatCurrency, calculatePrice, convertToBaseUnit } from './utils/posUtils';

const SAMPLE_PRODUCTS: Product[] = [
  { product_id: "101", product_name: "Amul Milk", brand_name: "Amul", category: "Dairy", barcode: "8901262000012", price_per_unit: 70, unit_type: "liter", stock_quantity: 100 },
  { product_id: "102", product_name: "Sugar", brand_name: "Local", category: "Grocery", barcode: "8901234567890", price_per_unit: 100, unit_type: "kg", stock_quantity: 200 },
  { product_id: "103", product_name: "Maggi Noodles", brand_name: "Nestle", category: "Snacks", barcode: "8901058812345", price_per_unit: 14, unit_type: "pcs", stock_quantity: 300 },
  { product_id: "104", product_name: "Basmati Rice", brand_name: "India Gate", category: "Grocery", barcode: "8901234567891", price_per_unit: 120, unit_type: "kg", stock_quantity: 150 },
  { product_id: "105", product_name: "Coca Cola", brand_name: "Coke", category: "Beverages", barcode: "8901234567892", price_per_unit: 40, unit_type: "liter", stock_quantity: 80 }
];

const DEFAULT_SETTINGS: AppSettings = {
  shopName: "SuperPOS Terminal",
  address: "123 Market Street, City Center",
  phone: "+91 9876543210",
  email: "contact@superpos.com",
  website: "www.superpos.com",
  taxId: "GSTIN-1234567890",
  footerNote: "Thank you for shopping with us!",
  upiId: "merchant@upi",
  taxRate: 18,
  currency: "₹",
  lowStockThreshold: 10
};

export default function App() {
  const [activeTab, setActiveTab] = useState('search');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [weightInputProduct, setWeightInputProduct] = useState<Product | null>(null);
  const [inputWeight, setInputWeight] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [totalProducts, setTotalProducts] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [pageSize] = useState(50);
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [totalSalesCount, setTotalSalesCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [isRestocking, setIsRestocking] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('pos_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const isProcessingScan = useRef(false);

  // Initialize data
  useEffect(() => {
    const init = async () => {
      const [existingProducts, existingSales, existingCategories] = await Promise.all([
        dbService.getPaginatedProducts(1, pageSize),
        dbService.getPaginatedSales(1, 10),
        dbService.getCategories()
      ]);

      if (existingProducts.total === 0) {
        await dbService.saveProducts(SAMPLE_PRODUCTS);
        const [firstPage, cats] = await Promise.all([
          dbService.getPaginatedProducts(1, pageSize),
          dbService.getCategories()
        ]);
        setProducts(firstPage.products);
        setTotalProducts(firstPage.total);
        setCategories(cats);
      } else {
        setProducts(existingProducts.products);
        setTotalProducts(existingProducts.total);
        setCategories(existingCategories);
      }
      setSales(existingSales.sales);
      setTotalSalesCount(existingSales.total);
      
      const [lowStock, revenue] = await Promise.all([
        dbService.getLowStockCount(settings.lowStockThreshold),
        dbService.getTotalRevenue()
      ]);
      setLowStockCount(lowStock);
      setTotalRevenue(revenue);
    };
    init();
  }, [pageSize, settings.lowStockThreshold]);

  // Handle Search and Pagination
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim() || (selectedCategory && selectedCategory !== 'All')) {
        setIsSearching(true);
        const results = await dbService.searchProducts(searchQuery, selectedCategory, 100);
        setProducts(results);
        setTotalProducts(results.length);
        setIsSearching(false);
      } else {
        const { products: paginated, total } = await dbService.getPaginatedProducts(inventoryPage, pageSize);
        setProducts(paginated);
        setTotalProducts(total);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory, inventoryPage, pageSize]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2000);
  };

  const addToCart = useCallback(async (barcode: string) => {
    if (!barcode || barcode.trim() === '' || isProcessingScan.current) return;
    isProcessingScan.current = true;

    try {
      const product = await dbService.getProductByBarcode(barcode);
      if (!product) {
        showToast('Product not found', 'error');
        return;
      }

      if (product.stock_quantity <= 0) {
        showToast('Out of stock', 'error');
        return;
      }

      // Dynamic weight billing: if unit is weight-based, ask for weight
      const isWeightBased = ['kg', 'g', 'liter', 'ml'].includes(product.unit_type);
      if (isWeightBased && !weightInputProduct) {
        setWeightInputProduct(product);
        setInputWeight('');
        setIsScannerOpen(false);
        return;
      }

      const weightToUse = isWeightBased ? Number(inputWeight) : 1;

      setCart(prev => {
        const existing = prev.find(item => item.product_id === product.product_id);
        if (existing) {
          const newQty = existing.displayQuantity + weightToUse;
          return prev.map(item => 
            item.product_id === product.product_id 
              ? { 
                  ...item, 
                  displayQuantity: newQty, 
                  quantity: convertToBaseUnit(newQty, item.selectedUnit),
                  subtotal: calculatePrice(item.price_per_unit, newQty, item.selectedUnit)
                } 
              : item
          );
        }
        return [...prev, {
          ...product,
          quantity: convertToBaseUnit(weightToUse, product.unit_type),
          displayQuantity: weightToUse,
          selectedUnit: product.unit_type,
          subtotal: calculatePrice(product.price_per_unit, weightToUse, product.unit_type)
        }];
      });

      if (isWeightBased) {
        setWeightInputProduct(null);
        setInputWeight('');
      }

      showToast(`Added ${product.product_name}`);
      
      // Small delay to allow user to see success state
      setTimeout(() => {
        setIsScannerOpen(false);
      }, 500);
    } finally {
      // Release lock after a short delay to prevent rapid re-triggers
      setTimeout(() => {
        isProcessingScan.current = false;
      }, 1000);
    }
  }, [weightInputProduct, inputWeight]);

  const updateCartQty = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product_id === id) {
        const newQty = Math.max(1, item.displayQuantity + delta);
        return {
          ...item,
          displayQuantity: newQty,
          quantity: convertToBaseUnit(newQty, item.selectedUnit),
          subtotal: calculatePrice(item.price_per_unit, newQty, item.selectedUnit)
        };
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.product_id !== id));
  };

  const handleSaleComplete = async (sale: Sale) => {
    await dbService.saveSale(sale);
    const { products: updatedProducts, total } = await dbService.getPaginatedProducts(inventoryPage, pageSize);
    setProducts(updatedProducts);
    setTotalProducts(total);
    
    const lowStock = await dbService.getLowStockCount(settings.lowStockThreshold);
    setLowStockCount(lowStock);
    
    const { sales: updatedSales, total: salesTotal } = await dbService.getPaginatedSales(1, 10);
    setSales(updatedSales);
    setTotalSalesCount(salesTotal);
    
    const revenue = await dbService.getTotalRevenue();
    setTotalRevenue(revenue);
    
    setCart([]);
    setIsCheckoutOpen(false);
    showToast('Transaction Completed');
  };

  const handleQuickCheckout = async () => {
    if (cart.length === 0) return;
    
    const sale: Sale = {
      id: `INV-${Date.now()}`,
      items: cart,
      subtotal,
      discount: 0,
      tax: subtotal * (settings.taxRate / 100),
      total: subtotal * (1 + settings.taxRate / 100),
      paymentMethod: 'Cash',
      customerName: 'Walk-in Customer',
      timestamp: Date.now()
    };
    
    await handleSaleComplete(sale);
  };

  const handleAutoRestock = async () => {
    setIsRestocking(true);
    try {
      const count = await dbService.restockOutOfStock(100);
      const { products: updated, total } = await dbService.getPaginatedProducts(inventoryPage, pageSize);
      setProducts(updated);
      setTotalProducts(total);
      
      const lowStock = await dbService.getLowStockCount(settings.lowStockThreshold);
      setLowStockCount(lowStock);
      
      showToast(`${count} products restocked with 100 units each`);
    } catch (err) {
      showToast('Restock failed', 'error');
    } finally {
      setIsRestocking(false);
    }
  };

  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    product_name: '',
    brand_name: '',
    category: '',
    barcode: '',
    price_per_unit: 0,
    unit_type: 'pcs',
    stock_quantity: 0
  });

  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);

  const handleAddProduct = async () => {
    if (!newProduct.product_name || !newProduct.barcode) {
      showToast('Name and Barcode are required', 'error');
      return;
    }
    const product = {
      ...newProduct,
      product_id: Date.now().toString(),
    } as Product;
    
    await dbService.saveProducts([product]);
    const [paginated, total, cats] = await Promise.all([
      dbService.getPaginatedProducts(inventoryPage, pageSize),
      dbService.getLowStockCount(settings.lowStockThreshold),
      dbService.getCategories()
    ]);
    setProducts(paginated.products);
    setTotalProducts(paginated.total);
    setLowStockCount(total);
    setCategories(cats);
    
    setIsAddProductOpen(false);
    setNewProduct({
      product_name: '',
      brand_name: '',
      category: '',
      barcode: '',
      price_per_unit: 0,
      unit_type: 'pcs',
      stock_quantity: 0
    });
    showToast('Product Added');
  };

  const handleDeleteProduct = async (productId: string) => {
    await dbService.deleteProduct(productId);
    const [paginated, total, cats] = await Promise.all([
      dbService.getPaginatedProducts(inventoryPage, pageSize),
      dbService.getLowStockCount(settings.lowStockThreshold),
      dbService.getCategories()
    ]);
    setProducts(paginated.products);
    setTotalProducts(paginated.total);
    setLowStockCount(total);
    setCategories(cats);
    
    showToast('Product Deleted');
  };

  return (
    <div className="flex h-screen w-full flex-col lg:flex-row overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Sidebar for Desktop */}
      <aside className="hidden lg:flex w-20 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-4 space-y-4">
        <div className="flex flex-col items-center gap-6 py-4">
          <button 
            onClick={() => setActiveTab('search')}
            className={`p-3 rounded-xl transition-all ${activeTab === 'search' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            title="Search Products"
          >
            <Search size={24} />
          </button>
          <button 
            onClick={() => setActiveTab('cart')}
            className={`p-3 rounded-xl transition-all relative ${activeTab === 'cart' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            title="Billing Cart"
          >
            <ShoppingCart size={24} />
            {cart.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
                {cart.length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`p-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            title="Statistics"
          >
            <LayoutDashboard size={24} />
          </button>
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`p-3 rounded-xl transition-all ${activeTab === 'inventory' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            title="Inventory"
          >
            <Package size={24} />
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`p-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            title="Settings"
          >
            <SettingsIcon size={24} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-none">
              <Zap size={18} />
            </div>
            <h1 className="font-bold text-xl tracking-tight">{settings.shopName}</h1>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsScannerOpen(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-semibold text-sm shadow-md hover:bg-indigo-700 transition-colors shrink-0"
            >
              <Scan size={18} />
              <span className="hidden sm:inline">Scan Barcode</span>
            </button>
            {activeTab !== 'cart' && cart.length > 0 && (
              <button 
                onClick={() => setActiveTab('cart')}
                className="relative p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                <ShoppingCart size={24} />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 animate-bounce">
                  {cart.length}
                </span>
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {activeTab === 'search' && (
            <div className="flex flex-col gap-6 h-full">
              {/* Search Screen */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col flex-1 overflow-hidden">
                <div className="flex flex-col gap-6 mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h2 className="text-2xl font-black flex items-center gap-3">
                      <Search className="text-indigo-600" size={28} /> 
                      Product Search
                      {isSearching && <Loader2 className="animate-spin text-indigo-500" size={20} />}
                    </h2>
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-100 dark:border-slate-700">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Category:</span>
                      <select 
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="bg-white dark:bg-slate-900 border-none rounded-xl px-3 py-1.5 text-xs font-bold outline-none shadow-sm"
                      >
                        <option value="All">All Items</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Dedicated Search Input */}
                  <div className="relative group">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={24} />
                    <input 
                      type="text" 
                      autoFocus
                      placeholder="Type any letter to search instantly... (e.g. 'm')"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && products.length > 0) {
                          addToCart(products[0].barcode);
                          setSearchQuery('');
                          showToast(`Added ${products[0].product_name} to cart`);
                        }
                      }}
                      className="w-full pl-14 pr-24 py-5 bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500 rounded-[2rem] outline-none transition-all text-lg font-bold shadow-inner"
                    />
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                          <X size={20} />
                        </button>
                      )}
                      <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 dark:bg-slate-700 rounded-xl text-slate-500">
                        <span className="text-[10px] font-black uppercase">Enter</span>
                        <span className="text-[10px] font-bold">to Add</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Category Pills */}
                  <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    <button 
                      onClick={() => setSelectedCategory('All')}
                      className={`px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all ${selectedCategory === 'All' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'}`}
                    >
                      All Items
                    </button>
                    {categories.map(cat => (
                      <button 
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar">
                  {products.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                      <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                        <Search size={40} />
                      </div>
                      <p className="font-bold">No products found matching "{searchQuery}"</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-20">
                      {products.map(product => (
                        <motion.div 
                          key={product.product_id}
                          whileHover={{ y: -5 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            addToCart(product.barcode);
                            showToast(`Added ${product.product_name}`);
                          }}
                          className="p-4 bg-slate-50 dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 cursor-pointer hover:border-indigo-500 hover:shadow-xl hover:shadow-indigo-500/5 transition-all group relative overflow-hidden"
                        >
                          {product.stock_quantity <= 0 && (
                            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] rounded-[2rem] z-10 flex items-center justify-center">
                              <span className="bg-red-600 text-white text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-tighter shadow-lg">Out of Stock</span>
                            </div>
                          )}
                          <div className="aspect-square bg-white dark:bg-slate-900 rounded-2xl mb-3 flex items-center justify-center text-slate-300 group-hover:text-indigo-500 transition-colors shadow-inner">
                            <Package size={32} />
                          </div>
                          <div className="space-y-1 text-center">
                            <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">{product.category}</p>
                            <h3 className="font-bold text-sm line-clamp-2 min-h-[2.5rem] leading-tight">{product.product_name}</h3>
                            <div className="pt-2 flex flex-col items-center">
                              <p className="font-black text-base text-indigo-600 dark:text-indigo-400">{formatCurrency(product.price_per_unit)}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Per {product.unit_type}</p>
                            </div>
                          </div>
                          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg">
                              <Plus size={18} />
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Floating Cart Button for Mobile */}
              {cart.length > 0 && (
                <motion.button 
                  initial={{ y: 100 }}
                  animate={{ y: 0 }}
                  onClick={() => setActiveTab('cart')}
                  className="fixed bottom-20 left-1/2 -translate-x-1/2 lg:hidden bg-indigo-600 text-white px-8 py-4 rounded-full shadow-2xl shadow-indigo-500/40 flex items-center gap-3 z-50 font-black uppercase tracking-widest text-sm"
                >
                  <ShoppingCart size={20} />
                  View Cart ({cart.length})
                </motion.button>
              )}
            </div>
          )}

          {activeTab === 'cart' && (
            <div className="flex flex-col gap-6 h-full max-w-4xl mx-auto w-full">
              {/* Billing System (Cart) */}
              <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col flex-1 overflow-hidden">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-2xl flex items-center justify-center">
                      <ShoppingCart size={24} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black">Your Cart</h2>
                      <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{cart.length} Items Selected</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setCart([])}
                    className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-2xl transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
                  >
                    <Trash2 size={18} /> Clear
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto pr-2 no-scrollbar mb-8">
                  {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                      <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                        <ShoppingCart size={40} />
                      </div>
                      <p className="font-bold">Cart is empty</p>
                      <button 
                        onClick={() => setActiveTab('search')}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs"
                      >
                        Go to Search
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <AnimatePresence>
                        {cart.map(item => (
                          <motion.div 
                            key={item.product_id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="p-4 bg-slate-50 dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 flex items-center justify-between group"
                          >
                            <div className="flex items-center gap-4 flex-1">
                              <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-2xl flex items-center justify-center text-slate-300">
                                <Package size={24} />
                              </div>
                              <div>
                                <h4 className="font-bold text-sm leading-tight">{item.product_name}</h4>
                                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{formatCurrency(item.price_per_unit)} / {item.unit_type}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-6">
                              <div className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-2xl p-1.5 border border-slate-100 dark:border-slate-700 shadow-sm">
                                <button onClick={() => updateCartQty(item.product_id, -1)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"><Minus size={14} /></button>
                                <span className="text-sm font-black w-8 text-center">{item.displayQuantity}</span>
                                <button onClick={() => updateCartQty(item.product_id, 1)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"><Plus size={14} /></button>
                              </div>
                              <div className="text-right min-w-[80px]">
                                <p className="text-sm font-black text-indigo-600">{formatCurrency(item.subtotal)}</p>
                              </div>
                              <button 
                                onClick={() => removeFromCart(item.product_id)}
                                className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                              >
                                <X size={20} />
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="pt-8 border-t border-slate-100 dark:border-slate-800 space-y-6">
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
                          <span>Subtotal</span>
                          <span>{formatCurrency(subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
                          <span>Tax ({settings.taxRate}%)</span>
                          <span>{formatCurrency(subtotal * (settings.taxRate / 100))}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Grand Total</p>
                        <p className="text-4xl font-black text-indigo-600 tracking-tighter">{formatCurrency(subtotal * (1 + settings.taxRate / 100))}</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-4">
                      <button 
                        onClick={handleQuickCheckout}
                        className="flex-1 py-5 bg-green-600 text-white font-black uppercase tracking-widest rounded-3xl shadow-xl shadow-green-500/20 hover:bg-green-700 transition-all flex items-center justify-center gap-3 text-sm"
                      >
                        <Zap size={20} /> Quick Pay
                      </button>
                      <button 
                        onClick={() => setIsCheckoutOpen(true)}
                        className="flex-1 py-5 bg-indigo-600 text-white font-black uppercase tracking-widest rounded-3xl shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 transition-all text-sm"
                      >
                        Detailed Checkout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                  <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-2xl"><DollarSign size={24} /></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase">Total Revenue</p><p className="text-xl font-black">{formatCurrency(totalRevenue)}</p></div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                  <div className="p-4 bg-green-50 dark:bg-green-900/30 text-green-600 rounded-2xl"><TrendingUp size={24} /></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase">Total Sales</p><p className="text-xl font-black">{totalSalesCount}</p></div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                  <div className="p-4 bg-orange-50 dark:bg-orange-900/30 text-orange-600 rounded-2xl"><Package size={24} /></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase">Stock Items</p><p className="text-xl font-black">{totalProducts}</p></div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                  <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-600 rounded-2xl"><AlertTriangle size={24} /></div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-400 uppercase">Low Stock</p>
                    <p className="text-xl font-black">{lowStockCount}</p>
                  </div>
                  <button 
                    onClick={handleAutoRestock}
                    disabled={isRestocking}
                    className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all disabled:opacity-50"
                    title="Auto Restock (Add 100 to out of stock)"
                  >
                    {isRestocking ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
                  </button>
                </div>
              </div>
              
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="font-bold text-lg flex items-center gap-2"><History size={20} /> Recent Transactions</h3>
                  <button className="text-xs font-bold text-indigo-600 uppercase tracking-widest">View All</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-bold uppercase text-slate-400">
                      <tr>
                        <th className="px-6 py-4">Invoice ID</th>
                        <th className="px-6 py-4">Customer</th>
                        <th className="px-6 py-4">Method</th>
                        <th className="px-6 py-4">Amount</th>
                        <th className="px-6 py-4">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sales.map(sale => (
                        <tr key={sale.id} className="text-sm">
                          <td className="px-6 py-4 font-mono font-bold text-indigo-600">{sale.id}</td>
                          <td className="px-6 py-4 font-medium">{sale.customerName}</td>
                          <td className="px-6 py-4"><span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] font-bold">{sale.paymentMethod}</span></td>
                          <td className="px-6 py-4 font-black">{formatCurrency(sale.total)}</td>
                          <td className="px-6 py-4 text-slate-500">{new Date(sale.timestamp).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'inventory' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-bold text-lg">Inventory Management</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={handleAutoRestock}
                    disabled={isRestocking}
                    className="bg-orange-600 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-orange-500/20 hover:bg-orange-700 transition-all disabled:opacity-50"
                  >
                    {isRestocking ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />}
                    Auto Restock (100)
                  </button>
                  <button 
                    onClick={() => setIsAddProductOpen(true)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all"
                  >
                    <Plus size={14} />
                    Add Product
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-bold uppercase text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Product Name</th>
                      <th className="px-6 py-4">Barcode</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Price</th>
                      <th className="px-6 py-4">Stock</th>
                      <th className="px-6 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {products.map(product => (
                      <tr key={product.product_id} className="text-sm">
                        <td className="px-6 py-4 font-bold">{product.product_name}</td>
                        <td className="px-6 py-4 font-mono text-xs">{product.barcode}</td>
                        <td className="px-6 py-4"><span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-lg text-[10px] font-bold">{product.category}</span></td>
                        <td className="px-6 py-4 font-black">{formatCurrency(product.price_per_unit)}</td>
                        <td className="px-6 py-4">
                          <span className={`font-bold ${product.stock_quantity < settings.lowStockThreshold ? 'text-red-500' : 'text-green-500'}`}>
                            {product.stock_quantity} {product.unit_type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => handleDeleteProduct(product.product_id)}
                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {!searchQuery && (
                <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Showing {Math.min(totalProducts, (inventoryPage - 1) * pageSize + 1)} to {Math.min(totalProducts, inventoryPage * pageSize)} of {totalProducts}
                  </p>
                  <div className="flex gap-2">
                    <button 
                      disabled={inventoryPage === 1}
                      onClick={() => setInventoryPage(p => p - 1)}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button 
                      disabled={inventoryPage * pageSize >= totalProducts}
                      onClick={() => setInventoryPage(p => p + 1)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {/* Add Product Modal */}
              <AnimatePresence>
                {isAddProductOpen && (
                  <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      className="bg-white dark:bg-slate-900 rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800"
                    >
                      <div className="p-8 border-b border-slate-100 dark:border-slate-800">
                        <h3 className="text-xl font-black tracking-tight">Add New Product</h3>
                      </div>
                      <div className="p-8 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Product Name</label>
                            <input 
                              type="text" 
                              value={newProduct.product_name}
                              onChange={(e) => setNewProduct({ ...newProduct, product_name: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Barcode</label>
                            <input 
                              type="text" 
                              value={newProduct.barcode}
                              onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Brand</label>
                            <input 
                              type="text" 
                              value={newProduct.brand_name}
                              onChange={(e) => setNewProduct({ ...newProduct, brand_name: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category</label>
                            <input 
                              type="text" 
                              value={newProduct.category}
                              onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Price</label>
                            <input 
                              type="number" 
                              value={newProduct.price_per_unit}
                              onChange={(e) => setNewProduct({ ...newProduct, price_per_unit: Number(e.target.value) })}
                              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Stock</label>
                            <input 
                              type="number" 
                              value={newProduct.stock_quantity}
                              onChange={(e) => setNewProduct({ ...newProduct, stock_quantity: Number(e.target.value) })}
                              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                        <div className="flex gap-4 pt-4">
                          <button 
                            onClick={() => setIsAddProductOpen(false)}
                            className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 font-bold rounded-xl"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={handleAddProduct}
                            className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl"
                          >
                            Save Product
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          )}
          {activeTab === 'settings' && (
            <div className="max-w-4xl mx-auto space-y-8 pb-20">
              <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-black tracking-tight">Shop Configuration</h3>
                    <p className="text-slate-500 text-sm mt-1">Manage your business details and terminal preferences.</p>
                  </div>
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-2xl">
                    <SettingsIcon size={24} />
                  </div>
                </div>
                <div className="p-8 space-y-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shop Name</label>
                      <input 
                        type="text" 
                        value={settings.shopName}
                        onChange={(e) => setSettings({ ...settings, shopName: e.target.value })}
                        className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phone Number</label>
                      <input 
                        type="text" 
                        value={settings.phone}
                        onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                        className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email Address</label>
                      <input 
                        type="email" 
                        value={settings.email}
                        onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                        className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Website</label>
                      <input 
                        type="text" 
                        value={settings.website}
                        onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                        className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">UPI ID</label>
                      <input 
                        type="text" 
                        value={settings.upiId}
                        onChange={(e) => setSettings({ ...settings, upiId: e.target.value })}
                        className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-indigo-600"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tax ID / GSTIN</label>
                      <input 
                        type="text" 
                        value={settings.taxId}
                        onChange={(e) => setSettings({ ...settings, taxId: e.target.value })}
                        className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tax Rate (%)</label>
                        <input 
                          type="number" 
                          value={settings.taxRate}
                          onChange={(e) => setSettings({ ...settings, taxRate: Number(e.target.value) })}
                          className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Low Stock Alert</label>
                        <input 
                          type="number" 
                          value={settings.lowStockThreshold}
                          onChange={(e) => setSettings({ ...settings, lowStockThreshold: Number(e.target.value) })}
                          className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-red-500"
                        />
                      </div>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Address</label>
                      <textarea 
                        value={settings.address}
                        onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                        className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all h-20 resize-none font-bold"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Receipt Footer Note</label>
                      <input 
                        type="text" 
                        value={settings.footerNote}
                        onChange={(e) => setSettings({ ...settings, footerNote: e.target.value })}
                        className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                      />
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      localStorage.setItem('pos_settings', JSON.stringify(settings));
                      showToast('Settings Saved Successfully');
                    }}
                    className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/30 hover:bg-indigo-700 transition-all active:scale-[0.98] uppercase tracking-widest text-sm"
                  >
                    Save Configuration
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm p-8 space-y-6">
                <h3 className="text-xl font-black tracking-tight">Data Management</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-700 space-y-4">
                    <p className="text-sm font-bold">Standard Import</p>
                    <p className="text-xs text-slate-500">Upload a JSON file with your product catalog. Currently: <span className="font-bold text-indigo-600">{totalProducts}</span> products.</p>
                    <input 
                      type="file" 
                      id="json-upload" 
                      accept=".json" 
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setIsImporting(true);
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                          try {
                            const data = JSON.parse(event.target?.result as string);
                            if (!Array.isArray(data)) throw new Error('Data must be an array');
                            
                            const processedData = data.map((p: any) => ({
                              ...p,
                              product_id: p.product_id || Math.random().toString(36).substr(2, 9),
                              product_name: String(p.product_name || ''),
                              brand_name: String(p.brand_name || ''),
                              barcode: String(p.barcode || ''),
                              category: String(p.category || 'General'),
                              price_per_unit: Number(p.price_per_unit) || 0,
                              stock_quantity: Number(p.stock_quantity) || 0,
                              unit_type: p.unit_type || 'pcs'
                            }));

                            await dbService.saveProducts(processedData);
                            const { products: updated, total } = await dbService.getPaginatedProducts(1, pageSize);
                            setProducts(updated);
                            setTotalProducts(total);
                            setInventoryPage(1);
                            
                            const lowStock = await dbService.getLowStockCount(settings.lowStockThreshold);
                            setLowStockCount(lowStock);
                            
                            showToast(`${processedData.length} products imported`);
                          } catch (err) {
                            showToast('Invalid JSON format or structure', 'error');
                          } finally {
                            setIsImporting(false);
                          }
                        };
                        reader.readAsText(file);
                      }}
                    />
                    <button 
                      onClick={() => document.getElementById('json-upload')?.click()}
                      disabled={isImporting}
                      className="w-full py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isImporting ? <Loader2 className="animate-spin" size={14} /> : <Scan size={14} />} Choose File
                    </button>
                  </div>

                  <div className="p-6 bg-indigo-50 dark:bg-indigo-900/10 rounded-3xl border border-indigo-100 dark:border-indigo-900/30 space-y-4">
                    <p className="text-sm font-bold text-indigo-600">Bulk Import (10MB)</p>
                    <p className="text-xs text-slate-500">Optimized for large datasets up to 10MB JSON files.</p>
                    <input 
                      type="file" 
                      id="bulk-json-upload" 
                      accept=".json" 
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        
                        if (file.size > 10 * 1024 * 1024) {
                          showToast('File size exceeds 10MB limit', 'error');
                          return;
                        }

                        setIsImporting(true);
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                          try {
                            const data = JSON.parse(event.target?.result as string);
                            if (!Array.isArray(data)) throw new Error('Data must be an array');
                            
                            // Process in chunks for better UI responsiveness if needed, 
                            // but for 10MB IndexedDB transaction is usually fine.
                            const processedData = data.map((p: any) => ({
                              ...p,
                              product_id: p.product_id || Math.random().toString(36).substr(2, 9),
                              product_name: String(p.product_name || ''),
                              brand_name: String(p.brand_name || ''),
                              barcode: String(p.barcode || ''),
                              category: String(p.category || 'General'),
                              price_per_unit: Number(p.price_per_unit) || 0,
                              stock_quantity: Number(p.stock_quantity) || 0,
                              unit_type: p.unit_type || 'pcs'
                            }));

                            await dbService.saveProducts(processedData);
                            const { products: updated, total } = await dbService.getPaginatedProducts(1, pageSize);
                            setProducts(updated);
                            setTotalProducts(total);
                            setInventoryPage(1);
                            
                            const lowStock = await dbService.getLowStockCount(settings.lowStockThreshold);
                            setLowStockCount(lowStock);
                            
                            showToast(`${processedData.length} products imported successfully`);
                          } catch (err) {
                            showToast('Import failed: Check file format', 'error');
                          } finally {
                            setIsImporting(false);
                          }
                        };
                        reader.readAsText(file);
                      }}
                    />
                    <button 
                      onClick={() => document.getElementById('bulk-json-upload')?.click()}
                      disabled={isImporting}
                      className="w-full py-3 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isImporting ? <Loader2 className="animate-spin" size={14} /> : <TrendingUp size={14} />} Start Bulk Import
                    </button>
                  </div>

                  <div className="p-6 bg-red-50 dark:bg-red-900/10 rounded-3xl border border-red-100 dark:border-red-900/30 space-y-4">
                    <p className="text-sm font-bold text-red-600">Clear Database</p>
                    <p className="text-xs text-slate-500">Delete all products and sales history.</p>
                    <button 
                      onClick={() => setIsResetConfirmOpen(true)}
                      disabled={isImporting}
                      className="w-full py-3 bg-red-600 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                    >
                      Reset Everything
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Navigation */}
        <nav className="lg:hidden h-16 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around px-4">
          <button 
            onClick={() => setActiveTab('search')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'search' ? 'text-indigo-600' : 'text-slate-400'}`}
          >
            <Search size={20} />
            <span className="text-[10px] font-bold uppercase">Search</span>
          </button>
          <button 
            onClick={() => setActiveTab('cart')}
            className={`flex flex-col items-center gap-1 relative ${activeTab === 'cart' ? 'text-indigo-600' : 'text-slate-400'}`}
          >
            <ShoppingCart size={20} />
            {cart.length > 0 && (
              <span className="absolute top-0 right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center border border-white dark:border-slate-900">
                {cart.length}
              </span>
            )}
            <span className="text-[10px] font-bold uppercase">Cart</span>
          </button>
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-indigo-600' : 'text-slate-400'}`}
          >
            <LayoutDashboard size={20} />
            <span className="text-[10px] font-bold uppercase">Stats</span>
          </button>
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'inventory' ? 'text-indigo-600' : 'text-slate-400'}`}
          >
            <Package size={20} />
            <span className="text-[10px] font-bold uppercase">Stock</span>
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center gap-1 ${activeTab === 'settings' ? 'text-indigo-600' : 'text-slate-400'}`}
          >
            <SettingsIcon size={20} />
            <span className="text-[10px] font-bold uppercase">Config</span>
          </button>
        </nav>
      </main>

      {/* Scanner Overlay */}
      <AnimatePresence>
        {isScannerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Scanner 
              onScan={addToCart}
              onClose={() => setIsScannerOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Checkout Overlay */}
      <AnimatePresence>
        {isCheckoutOpen && (
          <Checkout 
            cart={cart}
            settings={settings}
            onClose={() => setIsCheckoutOpen(false)}
            onComplete={handleSaleComplete}
          />
        )}
      </AnimatePresence>

      {/* Weight Input Modal */}
      <AnimatePresence>
        {weightInputProduct && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800"
            >
              <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black tracking-tight">{weightInputProduct.product_name}</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Enter Weight / Volume ({weightInputProduct.unit_type})</p>
                </div>
                <button onClick={() => setWeightInputProduct(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div className="relative">
                  <input 
                    autoFocus
                    type="number" 
                    step="0.001"
                    placeholder={`0.000 ${weightInputProduct.unit_type}`}
                    value={inputWeight}
                    onChange={(e) => setInputWeight(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && inputWeight) {
                        addToCart(weightInputProduct.barcode);
                      }
                    }}
                    className="w-full px-6 py-8 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-3xl outline-none focus:border-indigo-500 transition-all text-4xl font-black text-center"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xl uppercase">
                    {weightInputProduct.unit_type}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setWeightInputProduct(null)}
                    className="py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-2xl"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => addToCart(weightInputProduct.barcode)}
                    disabled={!inputWeight || Number(inputWeight) <= 0}
                    className="py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                  >
                    Add to Cart
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Weight Input Modal */}
      <AnimatePresence>
        {weightInputProduct && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800"
            >
              <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black tracking-tight">{weightInputProduct.product_name}</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Enter Weight / Volume ({weightInputProduct.unit_type})</p>
                </div>
                <button onClick={() => setWeightInputProduct(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div className="relative">
                  <input 
                    autoFocus
                    type="number" 
                    step="0.001"
                    placeholder={`0.000 ${weightInputProduct.unit_type}`}
                    value={inputWeight}
                    onChange={(e) => setInputWeight(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && inputWeight) {
                        addToCart(weightInputProduct.barcode);
                      }
                    }}
                    className="w-full px-6 py-8 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-3xl outline-none focus:border-indigo-500 transition-all text-4xl font-black text-center"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xl uppercase">
                    {weightInputProduct.unit_type}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setWeightInputProduct(null)}
                    className="py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-2xl"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => addToCart(weightInputProduct.barcode)}
                    disabled={!inputWeight || Number(inputWeight) <= 0}
                    className="py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                  >
                    Add to Cart
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {isResetConfirmOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 max-w-sm w-full text-center space-y-6 shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black tracking-tight">Reset Database?</h3>
                <p className="text-slate-500 text-sm font-medium">This will delete all products and sales history. This action cannot be undone.</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsResetConfirmOpen(false)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-bold text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    await dbService.clearAllData();
                    window.location.reload();
                  }}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm"
                >
                  Yes, Reset
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-24 left-1/2 z-[110] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-bold text-sm ${
              toast.type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
