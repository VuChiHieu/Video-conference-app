// frontend/src/components/FileMessage.jsx
import React from 'react';
import { Download, FileText, Image as ImageIcon, File } from 'lucide-react';

const FileMessage = ({ fileData, isOwn }) => {
  const { originalName, url, size, isImage, mimetype } = fileData;

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = () => {
    if (isImage) return <ImageIcon className="w-5 h-5" />;
    if (mimetype?.includes('pdf')) return <FileText className="w-5 h-5" />;
    return <File className="w-5 h-5" />;
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = `http://localhost:3001${url}`;
    link.download = originalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`max-w-[80%] rounded-2xl overflow-hidden ${
      isOwn 
        ? 'bg-gradient-to-r from-indigo-600 to-purple-600' 
        : 'bg-gray-700'
    }`}>
      {isImage ? (
        <div className="relative group">
          <img 
            src={`http://localhost:3001${url}`}
            alt={originalName}
            className="w-full max-w-sm rounded-t-2xl cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => window.open(`http://localhost:3001${url}`, '_blank')}
          />
          <div className="px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <ImageIcon className="w-4 h-4" />
              <span className="text-xs truncate max-w-[200px]">{originalName}</span>
            </div>
            <button
              onClick={handleDownload}
              className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 flex items-center gap-3">
          <div className={`p-3 rounded-lg ${
            isOwn ? 'bg-white bg-opacity-20' : 'bg-gray-600'
          }`}>
            {getFileIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{originalName}</p>
            <p className="text-gray-300 text-xs">{formatFileSize(size)}</p>
          </div>
          <button
            onClick={handleDownload}
            className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors flex-shrink-0"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default FileMessage;