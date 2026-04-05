import { useState, useMemo, useRef } from 'react';
import { X, CreditCard, Banknote, QrCode, CheckCircle2, Download, Printer, Share2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import html2canvas from 'html2canvas';
import { CartItem, AppSettings, Sale } from '../types';
import { formatCurrency, generateInvoiceId } from '../utils/posUtils';
import Receipt from './Receipt';

interface CheckoutProps {
  cart: CartItem[];
  settings: AppSettings;
  onClose: () => void;
  onComplete: (sale: Sale) => void;
}

export default function Checkout({ cart, settings, onClose, onComplete }: CheckoutProps) {
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [discount, setDiscount] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const tax = (subtotal - discount) * (settings.taxRate / 100);
  const total = subtotal - discount + tax;

  const upiString = useMemo(() => {
    const pa = settings.upiId || 'merchant@upi';
    const pn = encodeURIComponent(settings.shopName);
    const am = total.toFixed(2);
    return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=POS_Payment`;
  }, [settings.upiId, settings.shopName, total]);

  const handleCheckout = async () => {
    setIsProcessing(true);
    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    const sale: Sale = {
      id: generateInvoiceId(),
      timestamp: Date.now(),
      items: [...cart],
      subtotal,
      discount,
      tax,
      total,
      paymentMethod,
      customerName: customerName || 'Guest',
      customerPhone
    };

    setCompletedSale(sale);
    setIsProcessing(false);
  };

  const downloadReceipt = async () => {
    if (!receiptRef.current || !completedSale) return;
    try {
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
      });
      const link = document.createElement('a');
      link.download = `receipt-${completedSale.id}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Receipt generation failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="p-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xl font-bold">Checkout</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
          {!completedSale ? (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto text-indigo-600">
                  <CreditCard size={32} />
                </div>
                <h3 className="text-xl font-black">Payment</h3>
                <p className="text-slate-500 text-sm">Choose your payment method</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'Cash', icon: Banknote, label: 'Cash' },
                  { id: 'UPI', icon: QrCode, label: 'UPI QR' }
                ].map((m) => (
                  <button 
                    key={m.id}
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                      paymentMethod === m.id 
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600' 
                        : 'border-slate-100 dark:border-slate-800 hover:border-indigo-200'
                    }`}
                  >
                    <m.icon size={24} />
                    <span className="text-xs font-bold uppercase tracking-wider">{m.label}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <input 
                  type="text" 
                  placeholder="Customer Name (Optional)" 
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                />
              </div>

              <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-bold">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Discount</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400">₹</span>
                    <input 
                      type="number" 
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                      className="w-16 text-right bg-transparent font-bold outline-none border-b border-indigo-500"
                    />
                  </div>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Tax ({settings.taxRate}%)</span>
                  <span className="font-bold">{formatCurrency(tax)}</span>
                </div>
                <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <span className="font-bold">Total Bill</span>
                  <span className="text-xl font-black text-indigo-600">{formatCurrency(total)}</span>
                </div>
              </div>

              <button 
                onClick={handleCheckout}
                disabled={isProcessing}
                className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
              >
                {isProcessing ? 'Processing...' : 'Complete Payment'}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-4">
                {/* Visual Receipt Preview */}
                <div className="w-full bg-slate-50 dark:bg-slate-800/30 p-4 rounded-3xl flex justify-center">
                   <div className="shadow-lg transform scale-[0.85] origin-top">
                      <Receipt ref={receiptRef} sale={completedSale} settings={settings} />
                   </div>
                </div>

                <div className="flex gap-2 w-full">
                  <button 
                    onClick={downloadReceipt}
                    className="flex-1 py-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Download size={18} /> Save PNG
                  </button>
                  <button 
                    onClick={() => onComplete(completedSale)}
                    className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
