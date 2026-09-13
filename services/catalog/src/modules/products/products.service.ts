import { db } from "../../common/db/index.js";
import { products } from "../../common/db/schema.js";
import { eq, and } from "drizzle-orm";
import ApiError from "../../common/utils/api-error.js";
import type {
  CreateProductInput,
  ListProductsQueryInput,
  UpdateProductInput,
} from "./dto/products.dto.js";

const createProduct = async (input: CreateProductInput) => {
  const [product] = await db
    .insert(products)
    .values({
      name: input.name,
      description: input.description,
      price: input.price.toString(),
    })
    .returning();
  if (!product) {
    throw ApiError.internal("Failed to create product");
  }
  return product;
};

const getProductById = async (id: string) => {
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) {
    throw ApiError.notFound("Product not found");
  }
  return product;
};

const listProducts = async ({
  category,
  page,
  limit,
}: ListProductsQueryInput) => {
  const offset = (page - 1) * limit;
  const query = db.select().from(products);
  return category
    ? query.where(eq(products.category, category)).limit(limit).offset(offset)
    : query.limit(limit).offset(offset);
};

const updateProduct = async (id: string, input: UpdateProductInput) => {
  const [product] = await db
    .update(products)
    .set({
      ...input,
      price:input.price !== undefined ? input.price.toString() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(products.id, id))
    .returning();
    if(!product){
        throw ApiError.notFound("Product not found");
    }
    return product;
};

export { createProduct,getProductById,listProducts,updateProduct };