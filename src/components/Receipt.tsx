import { forwardRef, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CartItem, AppSettings, Sale } from '../types';
import { formatCurrency } from '../utils/posUtils';

interface ReceiptProps {
  sale: Sale;
  settings: AppSettings;
}

const Receipt = forwardRef<HTMLDivElement, ReceiptProps>(({ sale, settings }, ref) => {
  const upiString = useMemo(() => {
    const pa = settings.upiId || 'merchant@upi';
    const pn = encodeURIComponent(settings.shopName);
    const am = sale.total.toFixed(2);
    return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=POS_Payment`;
  }, [settings.upiId, settings.shopName, sale.total]);

  return (
    <div 
      ref={ref}
      className="w-[300px] bg-white p-8 text-slate-900 font-mono text-[11px] leading-tight"
      style={{ minHeight: '400px', backgroundColor: '#ffffff', color: '#0f172a' }}
    >
      <div className="text-center space-y-2 mb-6">
        <div className="w-12 h-12 bg-slate-100 rounded-xl mx-auto flex items-center justify-center overflow-hidden">
          <div className="w-6 h-6 bg-slate-400 rounded-sm"></div>
        </div>
        <h2 className="text-lg font-black uppercase tracking-tighter" style={{ color: '#0f172a' }}>{settings.shopName}</h2>
        <p className="text-[9px] text-slate-500 leading-tight whitespace-pre-line" style={{ color: '#64748b' }}>{settings.address}</p>
        <div className="text-[8px] text-slate-400 space-y-0.5" style={{ color: '#94a3b8' }}>
          <p>PH: {settings.phone} | {settings.email}</p>
          <p>{settings.website}</p>
          {settings.taxId && <p className="font-bold">TAX ID: {settings.taxId}</p>}
        </div>
      </div>

      <div className="border-y border-dashed border-slate-200 py-2 mb-4 flex justify-between uppercase font-bold text-[9px]" style={{ borderColor: '#e2e8f0' }}>
        <span>{new Date(sale.timestamp).toLocaleDateString()}</span>
        <span>#{sale.id}</span>
      </div>

      <table className="w-full mb-4">
        <thead>
          <tr className="text-left border-b border-slate-100" style={{ borderColor: '#f1f5f9' }}>
            <th className="pb-2">ITEM</th>
            <th className="pb-2 text-center">QTY</th>
            <th className="pb-2 text-right">TOTAL</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50" style={{ borderColor: '#f8fafc' }}>
          {sale.items.map((item, idx) => (
            <tr key={idx} className="border-b border-slate-50" style={{ borderColor: '#f8fafc' }}>
              <td className="py-2">
                <p className="font-bold">{item.product_name}</p>
                <p className="text-[8px] text-slate-400">₹{item.price_per_unit}/{item.unit_type}</p>
              </td>
              <td className="py-2 text-center">{item.displayQuantity}{item.selectedUnit}</td>
              <td className="py-2 text-right font-bold">{formatCurrency(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-1 border-t border-slate-100 pt-4 mb-6" style={{ borderTopColor: '#f1f5f9' }}>
        <div className="flex justify-between"><span>SUBTOTAL</span><span>{formatCurrency(sale.subtotal)}</span></div>
        {sale.discount > 0 && (
          <div className="flex justify-between text-slate-500" style={{ color: '#64748b' }}>
            <span>DISCOUNT</span>
            <span>-{formatCurrency(sale.discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-slate-500" style={{ color: '#64748b' }}>
          <span>TAX (GST {settings.taxRate}%)</span>
          <span>+{formatCurrency(sale.tax)}</span>
        </div>
        <div className="flex justify-between text-base font-black pt-2 border-t border-dashed border-slate-200" style={{ borderTopColor: '#e2e8f0' }}>
          <span>TOTAL</span>
          <span>{formatCurrency(sale.total)}</span>
        </div>
      </div>

      {sale.paymentMethod === 'UPI' && settings.upiId && (
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="p-2 bg-white border border-slate-100 rounded-xl" style={{ borderColor: '#f1f5f9' }}>
            <QRCodeSVG value={upiString} size={100} />
          </div>
          <p className="text-[8px] font-bold text-slate-400" style={{ color: '#94a3b8' }}>SCAN TO PAY VIA UPI</p>
        </div>
      )}

      <div className="text-center space-y-1 opacity-50" style={{ opacity: 0.5 }}>
        <p className="font-bold">THANK YOU FOR SHOPPING!</p>
        <p className="text-[8px] italic">{settings.footerNote}</p>
        <p>Visit again soon</p>
      </div>
    </div>
  );
});

Receipt.displayName = 'Receipt';

export default Receipt;
