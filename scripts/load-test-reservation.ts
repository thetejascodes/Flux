const INVENTORY_URL = "http://inventory:4002";
const CONCURRENT_REQUESTS = 100;

const PRODUCT_ID = "03208b3e-8eaa-4163-8fa8-914e99f204e2";
const WAREHOUSE_ID = "6193882b-fab5-4cde-9c0d-dd87b335c56e";

async function attemptReservation(index: number) {
  const orderId = crypto.randomUUID();

  const response = await fetch(`${INVENTORY_URL}/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productId: PRODUCT_ID,
      warehouseId: WAREHOUSE_ID,
      quantity: 1,
      orderId,
    }),
  });

  return { index, status: response.status, ok: response.ok };
}

async function runLoadTest() {
  console.log(
    `Firing ${CONCURRENT_REQUESTS} concurrent reservation attempts...`,
  );

  const results = await Promise.all(
    Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
      attemptReservation(i),
    ),
  );

  const succeeded = results.filter((r) => r.status === 201);
  const conflicted = results.filter((r) => r.status === 409);
  const other = results.filter(
    (r) => r.status !== 201 && r.status !== 409,
  );

  console.log(`\nResults:`);
  console.log(`  Succeeded (201): ${succeeded.length}`);
  console.log(`  Conflicted (409 - insufficient stock): ${conflicted.length}`);
  if (other.length > 0) {
    console.log(`  ⚠️  Unexpected statuses: ${other.length}`, other);
  }

  if (succeeded.length === 1 && conflicted.length === CONCURRENT_REQUESTS - 1) {
    console.log(`\n✅ PASS — exactly 1 reservation succeeded, the other 99 were cleanly rejected. No overselling.`);
  } else {
    console.log(
      `\n❌ FAIL — expected 1 success + ${CONCURRENT_REQUESTS - 1} clean 409s, got ${succeeded.length} success + ${conflicted.length} conflicted (+ ${other.length} unexpected).`,
    );
  }
}

runLoadTest();