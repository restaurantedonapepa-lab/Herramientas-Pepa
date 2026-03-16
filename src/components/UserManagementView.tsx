import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Users, Shield, User as UserIcon, ChefHat, CreditCard, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'admin' | 'cliente' | 'mesero' | 'cajero' | 'cocina';
  lastLogin: any;
}

export const UserManagementView: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({
        ...doc.data(),
        uid: doc.id
      })) as UserProfile[];
      setUsers(usersData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { role: newRole });
      Swal.fire({
        icon: 'success',
        title: 'Rol actualizado',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } catch (error) {
      console.error("Error updating role:", error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo actualizar el rol.'
      });
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Shield className="w-4 h-4 text-red-500" />;
      case 'cocina': return <ChefHat className="w-4 h-4 text-orange-500" />;
      case 'cajero': return <CreditCard className="w-4 h-4 text-blue-500" />;
      case 'mesero': return <Users className="w-4 h-4 text-green-500" />;
      default: return <UserIcon className="w-4 h-4 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 pt-24">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-red-100 rounded-xl">
          <Users className="w-8 h-8 text-red-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestión de Usuarios</h1>
          <p className="text-gray-500">Administra los roles y permisos del personal</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-bottom border-gray-100">
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Usuario</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Email</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Rol Actual</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">Cambiar Rol</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.uid} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img 
                        src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
                        alt="" 
                        className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
                      />
                      <span className="font-medium text-gray-900">{user.displayName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{user.email}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full w-fit">
                      {getRoleIcon(user.role)}
                      <span className="text-sm font-medium capitalize">{user.role}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select 
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.uid, e.target.value)}
                      className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-red-500 outline-none transition-all"
                      disabled={user.email === 'restaurantedonapepa@gmail.com'}
                    >
                      <option value="cliente">Cliente</option>
                      <option value="mesero">Mesero</option>
                      <option value="cajero">Cajero</option>
                      <option value="cocina">Cocina</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
