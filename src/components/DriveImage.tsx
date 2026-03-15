import React from 'react';

interface DriveImageProps {
  imageId: string;
  className?: string;
  alt?: string;
}

export const DriveImage: React.FC<DriveImageProps> = ({ imageId, className, alt }) => {
  const src = imageId ? `https://lh3.googleusercontent.com/d/${imageId}=w800` : 'https://via.placeholder.com/400x300?text=Sin+Imagen';
  
  return (
    <img
      src={src}
      alt={alt || "Imagen del producto"}
      className={className}
      referrerPolicy="no-referrer"
      onError={(e) => {
        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x300?text=Error+Imagen';
      }}
    />
  );
};
