import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, getDriveImageUrl, auth } from '../firebase';
import { Product, Review } from '../types';
import { useCart } from '../context/CartContext';
import { 
  ArrowLeft, ShoppingCart, Star, Share2, MessageSquare, 
  Facebook, Twitter, Send, CheckCircle2, AlertCircle,
  ChevronRight, Heart, UtensilsCrossed
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Swal from 'sweetalert2';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ProductDetailView: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { addToCart, toggleFavorite, isFavorite, triggerFlyAnimation } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [newReview, setNewReview] = useState({ rating: 5, comment: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let unsubReviews: (() => void) | undefined;

    const q = query(collection(db, 'products'), where('active', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      const found = prods.find(p => {
        const pSlug = p.slug || p.name.toLowerCase().replace(/ /g, '-').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return pSlug === slug;
      });
      
      if (found) {
        setProduct(found);
        
        // Limpiar listener de reseñas anterior si existe
        if (unsubReviews) unsubReviews();

        const reviewsQ = query(
          collection(db, 'reviews'), 
          where('productId', '==', found.id),
          orderBy('timestamp', 'desc')
        );
        unsubReviews = onSnapshot(reviewsQ, (revSnap) => {
          setReviews(revSnap.docs.map(d => ({ id: d.id, ...d.data() } as Review)));
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, 'reviews');
        });
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    return () => {
      unsubscribe();
      if (unsubReviews) unsubReviews();
    };
  }, [slug]);

  const handleAddToCart = () => {
    if (!product) return;
    addToCart({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1
    });
    Swal.fire({
      icon: 'success',
      title: '¡Añadido!',
      text: `${product.name} se agregó al carrito`,
      timer: 1500,
      showConfirmButton: false,
      position: 'top-end',
      toast: true
    });
  };

  const handleShare = (platform: 'facebook' | 'twitter' | 'whatsapp') => {
    const url = window.location.href;
    const text = `¡Mira este delicioso plato en Doña Pepa: ${product?.name}!`;
    
    let shareUrl = '';
    if (platform === 'facebook') shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    if (platform === 'twitter') shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    if (platform === 'whatsapp') shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text + ' ' + url)}`;
    
    window.open(shareUrl, '_blank');
  };

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      Swal.fire('Inicia sesión', 'Debes estar autenticado para dejar una reseña', 'info');
      return;
    }
    if (!newReview.comment.trim()) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'reviews'), {
        productId: product?.id,
        userName: auth.currentUser.displayName || 'Usuario Anónimo',
        rating: newReview.rating,
        comment: newReview.comment,
        timestamp: serverTimestamp()
      });
      setNewReview({ rating: 5, comment: '' });
      Swal.fire({ icon: 'success', title: 'Reseña enviada', timer: 1500, showConfirmButton: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reviews');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
    </div>
  );

  if (!product) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-white">
      <AlertCircle className="w-16 h-16 text-gray-200 mb-4" />
      <h2 className="text-2xl font-black text-gray-800">Plato no encontrado</h2>
      <Link to="/catalog" className="mt-4 text-red-600 font-bold flex items-center gap-2">
        <ArrowLeft className="w-4 h-4" /> Volver al catálogo
      </Link>
    </div>
  );

  const averageRating = reviews.length > 0 
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
    : 0;

  return (
    <div className="bg-white min-h-screen pb-24">
      <main className="max-w-7xl mx-auto px-4 pt-8">
        {/* Breadcrumbs / Back Button */}
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={() => navigate(-1)} 
            className="flex items-center gap-2 text-gray-400 hover:text-red-600 font-black uppercase tracking-widest text-xs transition"
          >
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => handleShare('whatsapp')} className="p-3 bg-green-50 text-green-600 rounded-2xl hover:bg-green-100 transition shadow-sm">
              <Send className="w-5 h-5" />
            </button>
            <button onClick={() => handleShare('facebook')} className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 transition shadow-sm">
              <Facebook className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Image Section */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="relative rounded-[40px] overflow-hidden aspect-square bg-gray-50 shadow-2xl group"
          >
            <img 
              src={getDriveImageUrl(product.imageId)} 
              alt={product.name} 
              className="w-full h-full object-cover transition duration-700 group-hover:scale-110"
              referrerPolicy="no-referrer"
            />
            <div className="absolute top-6 right-6">
              <button 
                onClick={(e) => {
                  toggleFavorite(product);
                  if (!isFavorite(product.id)) {
                    triggerFlyAnimation(e, getDriveImageUrl(product.imageId), 'favorites');
                  }
                }}
                className={cn(
                  "p-4 rounded-full shadow-2xl transition backdrop-blur-md",
                  isFavorite(product.id) 
                    ? "bg-red-600 text-white" 
                    : "bg-white/90 text-gray-400 hover:text-red-600"
                )}
              >
                <Heart className={cn("w-6 h-6", isFavorite(product.id) && "fill-current")} />
              </button>
            </div>
          </motion.div>

          {/* Info Section */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col"
          >
            <div className="space-y-4">
              <span className="inline-block px-4 py-1.5 bg-red-50 text-red-600 text-xs font-black uppercase tracking-widest rounded-full">
                {product.category}
              </span>
              <h1 className="text-5xl font-black text-gray-900 leading-tight">{product.name}</h1>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 text-orange-500">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} className={cn("w-5 h-5 fill-current", s > Math.round(averageRating) && "text-gray-200")} />
                  ))}
                </div>
                <span className="text-sm font-bold text-gray-400">({reviews.length} reseñas)</span>
              </div>

              <p className="text-4xl font-black text-red-600">${product.price.toLocaleString()}</p>
              
              <p className="text-lg text-gray-600 leading-relaxed py-4">
                {product.description || 'Una deliciosa especialidad de la casa preparada con los mejores ingredientes y el toque tradicional de Doña Pepa.'}
              </p>

              <div className="pt-8 border-t border-gray-100">
                <button 
                  onClick={(e) => {
                    handleAddToCart();
                    triggerFlyAnimation(e, getDriveImageUrl(product.imageId), 'cart');
                  }}
                  className="w-full py-5 bg-red-600 hover:bg-red-700 text-white font-black text-xl rounded-3xl shadow-2xl shadow-red-200 transition-all flex items-center justify-center gap-3"
                >
                  <ShoppingCart className="w-6 h-6" />
                  AÑADIR AL CARRITO
                </button>
              </div>
            </div>

            {/* Features */}
            <div className="grid grid-cols-3 gap-4 mt-12">
              <div className="p-4 bg-gray-50 rounded-3xl text-center">
                <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Fresco</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-3xl text-center">
                <UtensilsCrossed className="w-6 h-6 text-orange-500 mx-auto mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Artesanal</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-3xl text-center">
                <Star className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Premium</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Reviews Section */}
        <section className="mt-24 max-w-3xl">
          <div className="flex items-center justify-between mb-12">
            <h2 className="text-3xl font-black text-gray-900 flex items-center gap-3">
              <MessageSquare className="w-8 h-8 text-red-600" />
              Reseñas de Clientes
            </h2>
          </div>

          {/* Review Form */}
          <div className="bg-gray-50 rounded-[40px] p-8 mb-12 border border-gray-100">
            <h3 className="text-xl font-black text-gray-800 mb-6">Deja tu opinión</h3>
            <form onSubmit={submitReview} className="space-y-6">
              <div className="flex items-center gap-3">
                {[1, 2, 3, 4, 5].map(s => (
                  <button 
                    key={s} 
                    type="button"
                    onClick={() => setNewReview(prev => ({ ...prev, rating: s }))}
                    className="p-1 transition-transform hover:scale-125"
                  >
                    <Star className={cn("w-8 h-8", s <= newReview.rating ? "fill-orange-500 text-orange-500" : "text-gray-300")} />
                  </button>
                ))}
              </div>
              <textarea 
                placeholder="Cuéntanos tu experiencia..."
                className="w-full p-6 bg-white border-none rounded-3xl focus:ring-2 focus:ring-red-500 outline-none font-medium text-gray-700 min-h-[150px] shadow-sm"
                value={newReview.comment}
                onChange={(e) => setNewReview(prev => ({ ...prev, comment: e.target.value }))}
                required
              />
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="px-10 py-4 bg-gray-900 hover:bg-black text-white font-black rounded-2xl transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'ENVIANDO...' : 'PUBLICAR RESEÑA'}
              </button>
            </form>
          </div>

          {/* Reviews List */}
          <div className="space-y-8">
            {reviews.map(review => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={review.id} 
                className="p-8 bg-white border border-gray-100 rounded-[32px] shadow-sm"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-black text-gray-800">{review.userName}</h4>
                    <p className="text-xs font-bold text-gray-400">{review.timestamp?.toDate().toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-1 text-orange-500">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={cn("w-4 h-4 fill-current", s > review.rating && "text-gray-200")} />
                    ))}
                  </div>
                </div>
                <p className="text-gray-600 font-medium leading-relaxed">{review.comment}</p>
              </motion.div>
            ))}
            {reviews.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p className="font-bold uppercase tracking-widest">Sé el primero en opinar</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
