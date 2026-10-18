INSERT INTO products (id, name, description, price, category) VALUES
 ('a0000000-0000-4000-8000-000000000001','Whole Wheat Bread','Fresh sliced loaf',45.00,'bakery'),
 ('a0000000-0000-4000-8000-000000000002','Full Cream Milk 1L','Pasteurised milk',68.00,'dairy'),
 ('a0000000-0000-4000-8000-000000000003','Farm Eggs (12)','Free-range eggs',96.00,'dairy'),
 ('a0000000-0000-4000-8000-000000000004','Basmati Rice 5kg','Aged long-grain rice',520.00,'grocery'),
 ('8ac6fe5d-9f5f-4f6a-ab68-3bae630b2d06','Chai Patti 500g','Strong assam tea',240.00,'beverages'),
 ('7ebf4737-c06d-4e94-813f-b60cf01a1770','Whey Protein 1kg','Chocolate flavour',1299.00,'wellness'),
 ('1ef965e9-307c-4201-ad95-636b6b680882','Face Wash 100ml','Gentle daily cleanser',199.00,'personal care'),
 ('a0000000-0000-4000-8000-000000000005','Limited Chocolate Box','Seasonal, tiny stock',349.00,'snacks')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  price = EXCLUDED.price, category = EXCLUDED.category, updated_at = now();

DELETE FROM products WHERE id NOT IN (
 'a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002',
 'a0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000004',
 '8ac6fe5d-9f5f-4f6a-ab68-3bae630b2d06','7ebf4737-c06d-4e94-813f-b60cf01a1770',
 '1ef965e9-307c-4201-ad95-636b6b680882','a0000000-0000-4000-8000-000000000005');