import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { ImportCatalogDto } from './dto/import-catalog.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  /** Boshlang'ich katalogni ommaviy yuklash (faqat dori kartochkalari) */
  @Post('import-catalog')
  importCatalog(@Body() dto: ImportCatalogDto) {
    return this.productsService.importCatalog(dto);
  }

  @Get()
  findAll(@Query('search') search?: string) {
    return this.productsService.findAll(search);
  }

  /**
   * Kassa uchun — nom YOKI barcode bo'yicha qisman (LIKE) qidiruv.
   * `:id` route'dan oldin turishi shart, aks holda "search-pos" id deb o'qiladi.
   */
  @Get('search-pos')
  searchForPos(
    @Query('q') q: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.productsService.searchForPos(q ?? '', limit);
  }

  /** Skaner uchun — barcode bo'yicha qidirish (boshqa :id route'dan oldin turishi shart) */
  @Get('barcode/:code')
  findByBarcode(@Param('code') code: string) {
    return this.productsService.findByBarcode(code);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.remove(id);
  }
}
