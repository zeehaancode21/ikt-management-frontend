// Add this temporary component to your Vault page
// 📁 src/components/TempRegenerateQR.jsx

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

export function TempRegenerateQR() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [code, setCode] = useState('');
  const [confirming, setConfirming] = useState(false);

  const regenerateQR = async () => {
    setLoading(true);
    try {
      // ⚠️ TEMPORARY: This calls your new backend endpoint
      const response = await api.post('/vault/regenerate-qr');
      setQrData(response.data);
      toast({ title: 'New QR code generated!' });
    } catch (err) {
      toast({ 
        title: 'Failed', 
        description: err?.response?.data?.message,
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmCode = async () => {
    if (code.length !== 6) return;
    setConfirming(true);
    try {
      await api.post('/vault/confirm', { code });
      toast({ title: '✅ 2FA enabled successfully!' });
      // Refresh page or redirect
      window.location.reload();
    } catch (err) {
      toast({ 
        title: 'Invalid code', 
        description: 'Please try again',
        variant: 'destructive' 
      });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Card className="mb-6 border-2 border-yellow-500">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-yellow-600">⚠️ TEMPORARY: Regenerate QR</h3>
            <p className="text-sm text-muted-foreground">Use this only for boss setup, then remove!</p>
          </div>
          <Button 
            onClick={regenerateQR} 
            disabled={loading}
            variant="outline"
          >
            {loading ? 'Generating...' : '🔄 Generate New QR'}
          </Button>
        </div>

        {qrData && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-lg">
              <QRCodeSVG value={qrData.otpAuthUri} size={200} />
            </div>
            <p className="text-sm text-center">
              Secret: <code className="bg-muted px-2 py-1 rounded">{qrData.secret}</code>
            </p>
            <div className="flex gap-2 items-center">
              <InputOTP 
                maxLength={6} 
                value={code} 
                onChange={setCode}
              >
                <InputOTPGroup>
                  {[0,1,2,3,4,5].map(i => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <Button 
                onClick={confirmCode} 
                disabled={confirming || code.length !== 6}
              >
                {confirming ? 'Verifying...' : 'Confirm'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}