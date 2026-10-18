-- Wipe delivery history so reruns start clean (demo database only).
DELETE FROM deliveries;

INSERT INTO warehouses (id, name, latitude, longitude) VALUES
 ('6193882b-fab5-4cde-9c0d-dd87b335c56e', 'Flux Dark Store - Koramangala', 12.935200, 77.624500)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude, updated_at = now();

INSERT INTO drivers (id, name, status, current_latitude, current_longitude) VALUES
 ('d0000000-0000-4000-8000-000000000001', 'Ravi',   'AVAILABLE', 12.937000, 77.626000),
 ('d0000000-0000-4000-8000-000000000002', 'Meena',  'AVAILABLE', 12.942000, 77.620000),
 ('d0000000-0000-4000-8000-000000000003', 'Arjun',  'AVAILABLE', 12.925000, 77.635000),
 ('d0000000-0000-4000-8000-000000000004', 'Sana',   'AVAILABLE', 12.950000, 77.612000),
 ('d0000000-0000-4000-8000-000000000005', 'Imran',  'AVAILABLE', 12.915000, 77.650000)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, status = 'AVAILABLE',
  current_latitude = EXCLUDED.current_latitude,
  current_longitude = EXCLUDED.current_longitude, updated_at = now();

DELETE FROM drivers WHERE id NOT IN (
 'd0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002',
 'd0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000004',
 'd0000000-0000-4000-8000-000000000005');