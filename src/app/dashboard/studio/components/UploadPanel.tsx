import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface UploadPanelProps {
  onUpload: (file: File) => Promise<void>;
}

export default function UploadPanel({ onUpload }: UploadPanelProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast.error('No file selected');
      return;
    }
    setUploading(true);
    try {
      await onUpload(selectedFile);
      toast.success('File uploaded successfully');
      setSelectedFile(null);
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 p-2 border-b">
      {/*
      <Input type="file" onChange={handleChange} disabled={uploading} />
      <Button onClick={handleSubmit} disabled={!selectedFile || uploading}>
        {uploading ? 'Uploading…' : 'Upload'}
      </Button>
      */}
    </div>
  );
}
