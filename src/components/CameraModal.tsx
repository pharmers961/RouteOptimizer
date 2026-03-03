import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64Image: string, mimeType: string) => void;
}

export default function CameraModal({ isOpen, onClose, onCapture }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser');
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsReady(true);
      setError(null);
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Could not access camera. Please check permissions.');
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        const base64Data = dataUrl.split(',')[1];
        onCapture(base64Data, 'image/jpeg');
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-stone-900 rounded-xl overflow-hidden w-full max-w-md relative flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 bg-stone-900 text-white border-b border-stone-800">
          <h3 className="font-medium">Scan Address</h3>
          <button onClick={onClose} className="p-1 hover:bg-stone-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="relative bg-black aspect-[3/4] flex items-center justify-center">
          {error ? (
            <div className="text-red-400 text-center p-6">{error}</div>
          ) : (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-cover"
            />
          )}
          <canvas ref={canvasRef} className="hidden" />
          
          {/* Scanning guide overlay */}
          <div className="absolute inset-0 border-[40px] border-black/30 pointer-events-none">
            <div className="w-full h-full border-2 border-amber-500/50 rounded-lg"></div>
          </div>
        </div>
        
        <div className="p-6 bg-stone-900 flex justify-center">
          <button 
            onClick={handleCapture}
            disabled={!!error || !isReady}
            className="w-16 h-16 rounded-full bg-amber-600 hover:bg-amber-500 border-4 border-stone-800 outline outline-2 outline-amber-600 flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Camera className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
