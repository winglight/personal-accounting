import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Category } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Plus, Trash2, Edit2, ChevronRight, ChevronDown } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export const CategoriesPage: React.FC = () => {
  const { categories, dispatch } = useAppContext();
  const [activeType, setActiveType] = useState<'expense' | 'income'>('expense');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<Category>>({
    name: '',
    type: 'expense',
    parentId: '',
  });

  const parents = categories.filter(c => c.type === activeType && !c.parentId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    if (editingCategory) {
      dispatch({
        type: 'UPDATE_CATEGORY',
        payload: { id: editingCategory.id, category: formData },
      });
    } else {
      dispatch({
        type: 'ADD_CATEGORY',
        payload: {
          id: uuidv4(),
          name: formData.name!,
          type: activeType,
          parentId: formData.parentId || undefined,
          sortOrder: 0,
          ...formData,
        } as Category,
      });
    }
    resetForm();
  };

  const resetForm = () => {
    setFormData({ name: '', type: activeType, parentId: '' });
    setEditingCategory(null);
    setIsFormOpen(false);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData(category);
    setActiveType(category.type);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this category?')) {
      dispatch({ type: 'DELETE_CATEGORY', payload: id });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Categories</h1>
        <Button onClick={() => { resetForm(); setIsFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Category
        </Button>
      </div>

      <div className="flex space-x-2 bg-white p-1 rounded-lg shadow-sm w-fit">
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeType === 'expense' ? 'bg-green-100 text-green-700' : 'text-gray-600 hover:bg-gray-100'}`}
          onClick={() => { setActiveType('expense'); setFormData(prev => ({ ...prev, type: 'expense' })); }}
        >
          Expense
        </button>
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeType === 'income' ? 'bg-green-100 text-green-700' : 'text-gray-600 hover:bg-gray-100'}`}
          onClick={() => { setActiveType('income'); setFormData(prev => ({ ...prev, type: 'income' })); }}
        >
          Income
        </button>
      </div>

      {isFormOpen && (
        <Card>
          <CardHeader>
            <CardTitle>{editingCategory ? 'Edit Category' : 'New Category'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Name"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
              />
              
              <Select
                label="Parent Category (Optional)"
                value={formData.parentId || ''}
                onChange={e => setFormData({ ...formData, parentId: e.target.value })}
                options={[
                    { value: '', label: 'None (Top Level)' },
                    ...parents.filter(p => p.id !== editingCategory?.id).map(p => ({ value: p.id, label: p.name }))
                ]}
              />

              <div className="flex space-x-2 justify-end">
                <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {parents.map(parent => (
          <CategoryItem 
            key={parent.id} 
            category={parent} 
            allCategories={categories}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
};

const CategoryItem: React.FC<{ 
  category: Category; 
  allCategories: Category[];
  onEdit: (c: Category) => void;
  onDelete: (id: string) => void;
}> = ({ category, allCategories, onEdit, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const children = allCategories.filter(c => c.parentId === category.id);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between p-4 hover:bg-gray-50">
        <div className="flex items-center space-x-2 cursor-pointer flex-1" onClick={() => setIsExpanded(!isExpanded)}>
          {children.length > 0 ? (
             isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />
          ) : <span className="w-4" />}
          <span className="font-medium">{category.name}</span>
        </div>
        <div className="flex space-x-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit(category)}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(category.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {isExpanded && children.length > 0 && (
        <div className="bg-gray-50 border-t border-gray-100">
          {children.map(child => (
            <div key={child.id} className="flex items-center justify-between p-3 pl-10 hover:bg-gray-100 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-700">{child.name}</span>
              <div className="flex space-x-1">
                <Button variant="ghost" size="sm" onClick={() => onEdit(child)}>
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(child.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
