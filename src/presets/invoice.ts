import type { TemplateElement } from '@/engine/core/document.js';
import type { TextVisualProps } from '@/plugins/textShared.js';
import type { TableProps } from '@/plugins/table/table.js';
import type { ElementPreset } from '@/presets/types.js';
import { assignFreshTableIdentities } from '@/presets/tableIdentities.js';

type TextElement = TemplateElement<TextVisualProps & Record<string, unknown>, string>;

function textStyle(element: TemplateElement<object>): TextVisualProps {
  return element.props as TextVisualProps;
}

export const invoicePreset: ElementPreset = {
  id: 'invoice-standard-ja',
  label: '标准日文发票',
  labelKey: 'preset.invoice.label',
  category: '发票模板',
  createElements({ origin, registry, createId }) {
    const at = (x: number, y: number) => ({ x: origin.x + x, y: origin.y + y });
    const create = (type: string, x: number, y: number) => registry.require(type)
      .createDefaultElement({ id: createId('el'), position: at(x, y) }) as TemplateElement<object>;
    const elements: TemplateElement<object>[] = [];

    const title = create('label', 50, 0);
    title.name = '請求書タイトル';
    title.value = '請 求 書';
    title.box = { ...title.box, width: 80, height: 15 };
    Object.assign(textStyle(title), { fontSize: 24, fontWeight: 'bold', align: 'center' });
    elements.push(title);

    const invoiceNumber = create('text', 145, 1) as TextElement;
    invoiceNumber.name = '請求番号';
    invoiceNumber.value = 'INV-0001';
    invoiceNumber.binding = { key: 'invoiceNumber' };
    invoiceNumber.box = { ...invoiceNumber.box, width: 35, height: 8 };
    Object.assign(textStyle(invoiceNumber), { fontSize: 9, align: 'left', multiline: false });
    elements.push(invoiceNumber);

    const issueDate = create('date', 135, 11) as TextElement;
    issueDate.name = '発行日';
    issueDate.value = '';
    issueDate.binding = { key: 'issueDate' };
    issueDate.box = { ...issueDate.box, width: 45, height: 8 };
    Object.assign(textStyle(issueDate), { fontSize: 9, align: 'right' });
    elements.push(issueDate);

    const customerLabel = create('label', 0, 28);
    customerLabel.name = '請求先ラベル';
    customerLabel.value = '請求先';
    customerLabel.box = { ...customerLabel.box, width: 30, height: 8 };
    Object.assign(textStyle(customerLabel), { fontSize: 9, fontWeight: 'bold' });
    elements.push(customerLabel);

    const customer = create('text', 0, 36) as TextElement;
    customer.name = '顧客名';
    customer.value = '株式会社〇〇 御中';
    customer.binding = { key: 'customerName', required: false };
    customer.box = { ...customer.box, width: 100, height: 12 };
    Object.assign(textStyle(customer), { fontSize: 14, multiline: false });
    elements.push(customer);

    const issuer = create('text', 110, 28) as TextElement;
    issuer.name = '発行者情報';
    issuer.value = '株式会社 LayoutPDF\n架空県サンプル市文書町 1-2-3\n登録番号: T0000000000000';
    issuer.binding = { key: 'issuerInfo' };
    issuer.box = { ...issuer.box, width: 70, height: 24 };
    Object.assign(textStyle(issuer), { fontSize: 9, align: 'right', multiline: true });
    elements.push(issuer);

    const greeting = create('label', 0, 58);
    greeting.name = '挨拶文';
    greeting.value = '下記のとおり御請求申し上げます。';
    greeting.box = { ...greeting.box, width: 180, height: 8 };
    Object.assign(textStyle(greeting), { fontSize: 9 });
    elements.push(greeting);

    const line = create('line', 0, 68);
    line.name = '区切り線';
    line.box = { ...line.box, width: 180, height: 2 };
    elements.push(line);

    const table = create('table', 0, 75) as TemplateElement<TableProps, Array<Record<string, string> & { id: string }>>;
    table.name = '請求明細';
    table.binding = { key: 'items' };
    table.box = { ...table.box, width: 180, height: 105 };
    assignFreshTableIdentities(table, createId);
    table.value = [{
      id: createId('el'),
      item: '商品・サービス',
      quantity: '1',
      unitPrice: '0',
    }];
    elements.push(table);

    const bankLabel = create('label', 0, 205);
    bankLabel.name = '振込先ラベル';
    bankLabel.value = '振込先';
    bankLabel.box = { ...bankLabel.box, width: 30, height: 8 };
    Object.assign(textStyle(bankLabel), { fontSize: 9, fontWeight: 'bold' });
    elements.push(bankLabel);

    const bank = create('text', 0, 213) as TextElement;
    bank.name = '振込先';
    bank.value = '〇〇銀行 〇〇支店\n普通 0000000\nカ）モルドクラフト';
    bank.binding = { key: 'bankInfo' };
    bank.box = { ...bank.box, width: 95, height: 24 };
    Object.assign(textStyle(bank), { fontSize: 9, multiline: true });
    elements.push(bank);

    const note = create('text', 105, 205) as TextElement;
    note.name = '備考';
    note.value = '備考';
    note.binding = { key: 'note' };
    note.box = { ...note.box, width: 75, height: 32 };
    Object.assign(textStyle(note), { fontSize: 9, multiline: true });
    elements.push(note);

    return elements;
  },
};
