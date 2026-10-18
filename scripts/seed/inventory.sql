DELETE FROM reservations WHERE warehouse_id = '6193882b-fab5-4cde-9c0d-dd87b335c56e';
DELETE FROM stock        WHERE warehouse_id = '6193882b-fab5-4cde-9c0d-dd87b335c56e';

INSERT INTO stock (product_id, warehouse_id, quantity_available, quantity_reserved) VALUES
 ('a0000000-0000-4000-8000-000000000001','6193882b-fab5-4cde-9c0d-dd87b335c56e',200,0),
 ('a0000000-0000-4000-8000-000000000002','6193882b-fab5-4cde-9c0d-dd87b335c56e',200,0),
 ('a0000000-0000-4000-8000-000000000003','6193882b-fab5-4cde-9c0d-dd87b335c56e',150,0),
 ('a0000000-0000-4000-8000-000000000004','6193882b-fab5-4cde-9c0d-dd87b335c56e',80,0),
 ('8ac6fe5d-9f5f-4f6a-ab68-3bae630b2d06','6193882b-fab5-4cde-9c0d-dd87b335c56e',100,0),
 ('7ebf4737-c06d-4e94-813f-b60cf01a1770','6193882b-fab5-4cde-9c0d-dd87b335c56e',50,0),
 ('1ef965e9-307c-4201-ad95-636b6b680882','6193882b-fab5-4cde-9c0d-dd87b335c56e',100,0),
 ('a0000000-0000-4000-8000-000000000005','6193882b-fab5-4cde-9c0d-dd87b335c56e',1,0);