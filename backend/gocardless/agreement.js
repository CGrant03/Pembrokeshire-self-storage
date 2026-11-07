import {date,ordinal} from './dates.js';
export const version='2026-11-07-v2';
export const conditions=`STORAGE AGREEMENT
Miles John Williams Limited trading as Pembrokeshire Self Storage
86 Jury Lane, Haverfordwest, SA61 1BY
01437 723694 · midcounty12@gmail.com

1. Storage and access
The identified container is supplied for storing goods only. No living, sleeping, trading from or subletting the container is permitted. Access: 24 hours a day, 7 days a week. You must keep gates and access routes clear and follow reasonable site safety rules.

2. Duration and payment
The minimum rental is one calendar month, followed by a rolling monthly agreement. Rent is paid monthly in advance. The amount, start date and proposed collection schedule are shown in your agreement details. No arrears or extra charges are included in that monthly amount. No deposit is required under this agreement. Signing does not itself authorise a Direct Debit. Bank authorisation is completed separately through GoCardless, and the collection schedule must be confirmed before collection. Cancelling a Direct Debit does not end this agreement. We give at least 30 days’ written notice of any rent increase; no increase applies during the initial minimum period. You may leave before an increase takes effect by giving notice without an additional cancellation charge.

3. Goods and prohibited items
You own the goods or have authority from their owner to store them and enter this agreement. Do not store illegal or stolen goods, explosives, fireworks, fuel, gas cylinders, flammable liquids, hazardous chemicals, waste, perishable food, animals or anything liable to leak, attract pests or endanger people or property. No smoking, naked flames, electrical connections or battery charging. Ask us before storing vehicles or machinery containing fuel or batteries.

4. Care of goods
Pack goods safely, keep them clean and dry, allow airflow and do not obstruct vents. Outdoor containers are not climate controlled and condensation can occur. Protect moisture-sensitive items appropriately. Keep the container locked, safeguard access codes and keys, inspect your goods periodically and report leaks, damage, pests or security concerns promptly. You are responsible for authorised visitors following site rules. These duties do not remove our legal responsibilities.

5. Insurance and liability
We do not provide insurance for stored goods. You must arrange and maintain your own insurance covering goods in a self-storage container for their full replacement value throughout the rental. We provide the service with reasonable care and skill and remain responsible for loss or damage to the extent required by law. Nothing excludes liability for fraud, death or personal injury caused by negligence, or liability that cannot lawfully be excluded. Your statutory rights remain unaffected.

6. Inspection and repairs
We normally give reasonable notice before requesting access for inspection or repairs. We may enter without notice where reasonably necessary in an emergency, to prevent serious harm or to comply with a lawful requirement, and will inform you afterwards as soon as reasonably possible.

7. Missed payments
We will contact you about missed payments and explain the amount due. Tell us promptly about disputed charges or difficulty paying. For a serious remediable breach we normally give written notice and at least 14 days to put it right before ending the agreement. Urgent action may be taken for serious safety risks or unlawful activity. We do not automatically own your goods when payment is overdue. Any recovery, removal, sale or disposal must follow applicable legal requirements and notices; this agreement does not authorise immediate disposal.

8. Ending storage
You may end storage after the minimum period by giving at least 14 days’ written notice by email or post. Notice can be given during the minimum period to end on its final day. We may end an ongoing rental without alleging breach on at least 30 days’ written notice, without shortening the minimum period. Remove your goods and rubbish, leave the container reasonably clean, return our keys and notify us when vacated. We refund prepaid rent for days after the agreed termination date proportionately for that billing month within 14 days of confirming the final account. If goods remain, we contact you about collection and any lawful continuing charges and follow applicable legal requirements before disposal.

9. Consumer cancellation
Where statutory distance-contract cancellation rights apply, you may cancel within 14 days after the day the agreement is made without giving a reason, by a clear statement sent to our email or postal address. If you expressly request storage during that period and then cancel, a proportionate charge may be payable for service already supplied as permitted by law. Beginning storage does not itself remove cancellation rights. Refunds due following statutory cancellation will be made within 14 days after we are informed, using the original payment method unless otherwise agreed.
Optional cancellation wording: I cancel my storage agreement for [container], agreed on [date]. Customer name and address: [details]. Date: [date].

10. Records and complaints
Keep your contact details up to date. We use details to administer storage, agreements, payments and enquiries as explained in our privacy notice. Contact us with complaints so we can investigate. The law of England and Wales applies without removing mandatory consumer rights or rights concerning where a claim can be brought. A downloadable copy of the signed agreement is provided for you to keep.`;
export function documentText(d){
 const upfront=d.plan.mode==='upfront_monthly_v1';
 const terms=upfront?conditions.replace('Signing does not itself authorise a Direct Debit. Bank authorisation is completed separately through GoCardless, and the collection schedule must be confirmed before collection.','The first month is paid upfront by Pay by Bank through GoCardless. This covers storage from the storage start date until the first monthly Direct Debit date (exclusive). Signing alone does not take payment. On the following payment page you authorise the upfront payment and set up a Direct Debit. By accepting the payment schedule you authorise recurring monthly rent from the date shown below. GoCardless will send payment notifications. Access is confirmed by our team after payment is confirmed.'):conditions;
 return `${terms}\n\nAGREEMENT DETAILS\nCustomer: ${d.customer}\nContainer: ${d.container}\nSite: ${d.site}\nStorage start: ${date(d.start_date)}\nMonthly total including VAT: £${(d.plan.amount_pence/100).toFixed(2)}\n${upfront?'First month payable now: £'+(d.plan.amount_pence/100).toFixed(2)+' including VAT\nFirst monthly Direct Debit (month two)':'Proposed first collection'}: ${date(d.plan.first_date)}\nRegular collection day: ${ordinal(d.plan.day)} of each month (last day in shorter months; non-working days move to the next working day)\nVersion: ${version}`;
}
