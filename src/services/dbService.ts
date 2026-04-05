import { openDB, IDBPDatabase } from 'idb';
import { Product, Sale } from '../types';

const DB_NAME = 'SuperPOS_DB';
const DB_VERSION = 1;

export class DatabaseService {
  private db: Promise<IDBPDatabase>;

  constructor() {
    this.db = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('products')) {
          const productStore = db.createObjectStore('products', { keyPath: 'product_id' });
          productStore.createIndex('barcode', 'barcode', { unique: true });
          productStore.createIndex('category', 'category');
        }
        if (!db.objectStoreNames.contains('sales')) {
          db.createObjectStore('sales', { keyPath: 'id' });
        }
      },
    });
  }

  async getAllProducts(): Promise<Product[]> {
    return (await this.db).getAll('products');
  }

  async saveProducts(products: Product[]): Promise<void> {
    const tx = (await this.db).transaction('products', 'readwrite');
    for (const product of products) {
      await tx.store.put(product);
    }
    await tx.done;
  }

  async getProductByBarcode(barcode: string): Promise<Product | undefined> {
    return (await this.db).getFromIndex('products', 'barcode', barcode);
  }

  async saveSale(sale: Sale): Promise<void> {
    const tx = (await this.db).transaction(['sales', 'products'], 'readwrite');
    await tx.objectStore('sales').add(sale);
    
    // Update inventory
    for (const item of sale.items) {
      const product = await tx.objectStore('products').get(item.product_id);
      if (product) {
        product.stock_quantity -= item.quantity;
        await tx.objectStore('products').put(product);
      }
    }
    await tx.done;
  }

  async getPaginatedSales(page: number, pageSize: number): Promise<{ sales: Sale[], total: number }> {
    const db = await this.db;
    const tx = db.transaction('sales', 'readonly');
    const store = tx.objectStore('sales');
    
    const total = await store.count();
    const results: Sale[] = [];
    const start = (page - 1) * pageSize;
    
    let cursor = await store.openCursor(null, 'prev'); // Show newest first
    
    if (start > 0 && cursor) {
      cursor = await cursor.advance(start);
    }

    while (cursor && results.length < pageSize) {
      results.push(cursor.value);
      cursor = await cursor.continue();
    }
    
    return { sales: results, total };
  }

  async getTotalRevenue(): Promise<number> {
    const db = await this.db;
    const tx = db.transaction('sales', 'readonly');
    const store = tx.objectStore('sales');
    let total = 0;
    
    let cursor = await store.openCursor();
    while (cursor) {
      total += cursor.value.total;
      cursor = await cursor.continue();
    }
    return total;
  }

  async getAllSales(): Promise<Sale[]> {
    return (await this.db).getAll('sales');
  }

  async searchProducts(query: string, category?: string, limit = 50): Promise<Product[]> {
    const db = await this.db;
    const tx = db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    const results: Product[] = [];
    const lowerQuery = query.toLowerCase();
    
    let cursor = await store.openCursor();
    while (cursor && results.length < limit) {
      const p = cursor.value;
      const matchesQuery = !query || 
        (p.product_name?.toLowerCase()?.includes(lowerQuery)) || 
        (p.barcode?.includes(query)) ||
        (p.brand_name?.toLowerCase()?.includes(lowerQuery));
      
      const matchesCategory = !category || category === 'All' || p.category === category;

      if (matchesQuery && matchesCategory) {
        results.push(p);
      }
      cursor = await cursor.continue();
    }
    return results;
  }

  async getPaginatedProducts(page: number, pageSize: number): Promise<{ products: Product[], total: number }> {
    const db = await this.db;
    const tx = db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    
    const total = await store.count();
    const results: Product[] = [];
    const start = (page - 1) * pageSize;
    
    let cursor = await store.openCursor();
    let advanced = false;
    
    if (start > 0 && cursor) {
      cursor = await cursor.advance(start);
      advanced = true;
    }

    while (cursor && results.length < pageSize) {
      results.push(cursor.value);
      cursor = await cursor.continue();
    }
    
    return { products: results, total };
  }

  async deleteProduct(productId: string): Promise<void> {
    const tx = (await this.db).transaction('products', 'readwrite');
    await tx.store.delete(productId);
    await tx.done;
  }

  async restockOutOfStock(amount: number): Promise<number> {
    const db = await this.db;
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');
    let count = 0;
    
    let cursor = await store.openCursor();
    while (cursor) {
      if (cursor.value.stock_quantity <= 0) {
        const updated = { ...cursor.value, stock_quantity: amount };
        await cursor.update(updated);
        count++;
      }
      cursor = await cursor.continue();
    }
    await tx.done;
    return count;
  }

  async getLowStockCount(threshold: number): Promise<number> {
    const db = await this.db;
    const tx = db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    let count = 0;
    
    let cursor = await store.openCursor();
    while (cursor) {
      if (cursor.value.stock_quantity < threshold) {
        count++;
      }
      cursor = await cursor.continue();
    }
    return count;
  }

  async getCategories(): Promise<string[]> {
    const db = await this.db;
    const tx = db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    const categories = new Set<string>();
    
    let cursor = await store.openCursor();
    while (cursor) {
      if (cursor.value.category) {
        categories.add(cursor.value.category);
      }
      cursor = await cursor.continue();
    }
    return Array.from(categories).sort();
  }

  async clearAllData(): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(['products', 'sales'], 'readwrite');
    await tx.objectStore('products').clear();
    await tx.objectStore('sales').clear();
    await tx.done;
  }
}

export const dbService = new DatabaseService();
