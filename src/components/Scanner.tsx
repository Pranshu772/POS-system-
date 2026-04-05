import { useEffect, useRef, useState, FormEvent } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, AlertCircle } from 'lucide-react';

interface ScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function Scanner({ onScan, onClose }: ScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isLocked = useRef(false);
  const lastScannedRef = useRef<{ code: string; time: number } | null>(null);
  const onScanRef = useRef(onScan);
  const scannerId = 'reader';

  // Update ref when onScan changes without restarting effect
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const playBeep = () => {
    const audio = new Audio('https://www.soundjay.com/buttons/sounds/beep-07a.mp3');
    audio.play().catch(() => {});
  };

  useEffect(() => {
    const html5QrCode = new Html5Qrcode(scannerId);
    scannerRef.current = html5QrCode;

    const startScanner = async () => {
      try {
        const config = {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxSize = Math.max(150, Math.floor(minEdgeSize * 0.6));
            return {
              width: qrboxSize,
              height: qrboxSize
            };
          },
          aspectRatio: 1.0,
          disableFlip: true,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.QR_CODE
          ]
        };

        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            const code = decodedText?.trim();
            if (!code || isLocked.current) return;
            
            isLocked.current = true;
            setIsProcessing(true);
            playBeep();

            // Stop scanning immediately to prevent any further callbacks
            if (scannerRef.current?.isScanning) {
              scannerRef.current.stop().then(() => {
                onScanRef.current(code);
              }).catch((err) => {
                console.error("Failed to stop scanner:", err);
                onScanRef.current(code);
              });
            } else {
              onScanRef.current(code);
            }
          },
          () => {} // Ignore errors during scanning
        );
      } catch (err) {
        console.error('Scanner error:', err);
        setError('Could not access camera. Please check permissions.');
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []); // Empty dependency array to prevent restarts

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim() && !isProcessing) {
      setIsProcessing(true);
      playBeep();
      onScanRef.current(manualBarcode.trim());
      setManualBarcode('');
      setTimeout(() => setIsProcessing(false), 1000);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm">
      <div className="flex items-center justify-between p-6 text-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg">
            <Camera size={20} />
          </div>
          <h2 className="font-bold text-lg">Scan Barcode</h2>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="relative w-full max-w-sm aspect-square bg-slate-900 rounded-3xl overflow-hidden border-2 border-indigo-500/50 shadow-2xl shadow-indigo-500/20">
          <div id={scannerId} className="w-full h-full"></div>
          
          {/* Scanning Animation Overlay */}
          <div className="absolute inset-0 pointer-events-none">
            {isProcessing ? (
              <div className="absolute inset-0 bg-indigo-600/20 flex items-center justify-center backdrop-blur-[2px]">
                <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)] animate-[scan-line_2s_linear_infinite]"></div>
            )}
          </div>

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-900/90 text-white">
              <AlertCircle size={48} className="text-red-500 mb-4" />
              <p className="font-medium mb-4">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-indigo-600 rounded-xl font-bold text-sm"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        <div className="mt-12 w-full max-w-sm space-y-6">
          <div className="text-center">
            <p className="text-slate-400 text-sm font-medium">Point camera at the barcode</p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-black/90 px-4 text-slate-500 font-bold tracking-widest">Or enter manually</span>
            </div>
          </div>

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input 
              type="text" 
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              placeholder="Enter barcode number..."
              className="flex-1 bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              autoFocus
            />
            <button 
              type="submit"
              className="bg-indigo-600 text-white px-6 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
            >
              Add
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes scan-line {
          0% { top: 0; }
          100% { top: 100%; }
        }
        #reader__scan_region {
          background: transparent !important;
        }
        #reader__dashboard_section_csr button {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
