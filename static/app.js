"use strict";
const form = document.querySelector("#project-form");
const $ = id => document.getElementById(id);
const apiBase=document.querySelector('meta[name="api-base"]')?.content||"";
const ownerView=!!document.querySelector('meta[name="owner-calculator"]');
const apiUrl=path=>apiBase+path;
const fmt = (v,d=0) => v==null ? "—" : new Intl.NumberFormat(avLanguage==="en"?"en-US":"ru-RU",{maximumFractionDigits:d}).format(v);
let catalog={},result=null,inputSignature=null,currentVariant=null;
let uiCurrency = new URLSearchParams(location.search).get("currency")==="USD"?"USD":"RUB";
let benchmarks = null;
const moneyInputs = ["product_price","energy_price","budget_rub","water_cost_rub_m3","capex_per_kw_rub"];
function fxRate(){return Number($("usd-rub").value);}
function displayMoney(value){return uiCurrency==="USD"?value/fxRate():value;}
function inputMoney(value){return Number((uiCurrency==="USD"?value*fxRate():value).toPrecision(12));}
function money(value,million=false){return fmt(displayMoney(value)/(million?1e6:1),million?2:2)+" "+(million?phrase("млн ","million "):"")+uiCurrency;}
function translatedError(message){
 const text=t(String(message).replace(/^Value error, /,""));
 if(avLanguage==="en"&&/[А-Яа-яЁё]/.test(text))return "Could not complete the request. Check the inputs and try again.";
 return text;
}
function refreshCurrencyLabels(){
 document.querySelectorAll("label,th").forEach(el=>{
  const walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
  while(walk.nextNode()){
   const node=walk.currentNode;if(node.parentElement.closest("select"))continue;
   node.data=node.data.replace(/руб\.?|₽|RUB|USD/g,uiCurrency);
  }
 });
 // The exchange-rate unit must remain RUB per USD in either presentation currency.
 $("fx-label").textContent=phrase("Курс: RUB за 1 USD","Exchange rate: RUB per USD");
 $("fx-date-label").textContent=phrase("Дата курса","Exchange-rate date");
 $("manual-capex-label").textContent=phrase("Базовый CAPEX, ","Base CAPEX, ")+uiCurrency+"/kWdc";
 $("premium-label").textContent=phrase("Дополнительная надбавка АВ, %","Additional agrivoltaic premium, %");
 $("capex-mode-label").textContent=phrase("Источник капитальных затрат","Capital cost source");
 const names=[phrase("Прежние настройки сервиса","Existing service assumptions"),phrase("Страновой ориентир СЭС","Country PV benchmark"),phrase("Моя оценка проекта","My project estimate")];
 Array.from($("capex-mode").options).forEach((op,i)=>op.textContent=names[i]);
 $("benchmark-label").textContent=phrase("Источник и год CAPEX","CAPEX source and year");
 $("fx-note").textContent=phrase("Исходный курс 85,7116 RUB/USD — ЦБ РФ, 07.10.2026, для прежних расчётов. Это не текущий курс. Проверьте дату и измените курс при необходимости. При смене валюты суммы пересчитываются; при изменении курса введённые суммы сохраняются.","Initial rate 85.7116 RUB/USD: Bank of Russia, 7 Oct 2026, retained for earlier calculations. This is not a live rate. Check the date and edit as needed. Switching currency converts amounts; editing the rate keeps entered amounts unchanged.");
 for(const name of ["budget_rub","capex_per_kw_rub"]){const e=form.elements[name];e.max=String((name==="budget_rub"?1e12:1e8)/(uiCurrency==="USD"?fxRate():1));e.min=String((name==="budget_rub"?1:0.000001)/(uiCurrency==="USD"?fxRate():1));}
 refreshCostNote();
}
function populateBenchmarks(){
 const previous=$("capex-benchmark").value,country=form.elements.country.value.trim();
 const rows=(benchmarks?.records||[]).filter(r=>[r.country,...r.aliases].some(c=>c.toLowerCase()===country.toLowerCase()));
 // Canonical FAOSTAT country names are sent to the API.
 if(rows.length)form.elements.country.value=rows[0].country;
 $("capex-benchmark").replaceChildren();
 rows.forEach(row=>{const o=document.createElement("option");o.value=row.id;o.textContent=`${row.source} · ${row.usd_per_kw_dc} USD/kWdc (${row.price_year} USD)`;$("capex-benchmark").append(o);});
 if(rows.some(r=>r.id===previous))$("capex-benchmark").value=previous;
 if(!rows.length){const o=document.createElement("option");o.value="";o.textContent=phrase("Нет проверенных данных для страны","No verified benchmark for this country");$("capex-benchmark").append(o);}
 refreshCostNote();
}
function refreshCostNote(){
 const mode=$("capex-mode").value;
 $("benchmark-field").hidden=mode!=="country";$("capex-benchmark").disabled=mode!=="country";$("capex-benchmark").required=mode==="country";
 $("manual-capex-field").hidden=mode!=="manual";form.elements.capex_per_kw_rub.disabled=mode!=="manual";form.elements.capex_per_kw_rub.required=mode==="manual";
 const common=phrase(" Надбавка АВ задаётся вами; 0% означает отсутствие дополнительной надбавки. Существующая поправка за высоту применяется отдельно. Аккумуляторы не включены."," The AV premium is a user assumption; 0% means no additional premium. The existing height adjustment applies separately. Storage is excluded.");
 let text;
 if(mode==="legacy")text=phrase("Используются прежние настройки владельца, а не страновая статистика.","Uses existing owner assumptions, not country statistics.");
 else if(mode==="manual")text=phrase("Введите стоимость за кВт DC до надбавки АВ и поправки за высоту.","Enter cost per kW DC before the AV premium and height adjustment.");
 else {
  const row=benchmarks?.records.find(r=>r.id===$("capex-benchmark").value);
  text=row?phrase(`Обычная СЭС: ${row.usd_per_kw_dc} USD/kWdc, цены ${row.price_year} г. Это исторический ориентир, не стоимость агровольтаики. Инфляция не пересчитывается.`,`Conventional PV: ${row.usd_per_kw_dc} USD/kWdc in ${row.price_year} dollars. Historical reference, not an agrivoltaic quote. No inflation adjustment.`):phrase("Для этой страны нет проверенного ориентира. Выберите ручной ввод или прежние настройки.","No verified benchmark for this country. Choose a manual estimate or existing assumptions.");
 }
 $("cost-note").textContent=text+common;
 const row=mode==="country"&&benchmarks?.records.find(r=>r.id===$("capex-benchmark").value);
 if(row){const a=document.createElement("a");a.href=row.source_url;a.target="_blank";a.rel="noopener noreferrer";a.textContent=phrase(" Источник"," Source");$("cost-note").append(a);}
}
function showCostBasis(data){
 const b=data.cost_basis;
 if(!b){$("result-cost-basis").textContent="";return;}
 const source=b.benchmark?`${b.benchmark.source}: ${b.benchmark.usd_per_kw_dc} USD/kWdc (${b.benchmark.price_year} USD)`:b.mode==="manual"?phrase("Оценка пользователя","User estimate"):phrase("Прежние настройки сервиса","Existing service assumptions");
 $("result-cost-basis").textContent=`CAPEX: ${source}. ${phrase("Надбавка АВ","AV premium")}: ${b.av_premium_pct}%. ${phrase("Курс расчёта","Calculation FX")}: ${b.usd_rub} RUB/USD (${b.fx_date}). ${phrase("Валюта отображения","Display currency")}: ${uiCurrency}; ${phrase("курс отображения","display FX")}: ${fxRate()} RUB/USD (${$("fx-date").value}).`;
}
function exportResult(){
 const converted=structuredClone(result);
 // Preserve the API's explicit *_rub fields; add unambiguous presentation records.
 converted.presentation={currency:uiCurrency,usd_rub:fxRate(),fx_date:$("fx-date").value,
  variants:result.variants.map(v=>({id:v.id,capex:displayMoney(v.economics.capex),npv:displayMoney(v.economics.npv_rub),first_year_cash_flow:displayMoney(v.economics.net_income),water_savings:v.water.annual_savings_rub==null?null:displayMoney(v.water.annual_savings_rub),scenarios:v.scenarios.map(s=>({name:translatedScenario(s.name),npv:displayMoney(s.npv_rub)}))}))};
 return converted;
}
function rerenderPresentation(){
 if(result){const id=currentVariant?.id;render(result);const index=result.variants.findIndex(v=>v.id===id);if(index>=0)preview(index);if(JSON.stringify(payload())!==inputSignature)$("stale").hidden=false;}
}
// Defer binding until the rest of app.js has initialized.
queueMicrotask(()=>{
 $("ui-language").value=avLanguage;$("ui-currency").value=uiCurrency;
 if(uiCurrency==="USD")moneyInputs.forEach(name=>{const e=form.elements[name];if(e.value!="")e.value=Number(e.value)/fxRate();});
 refreshCurrencyLabels();
 $("ui-currency").addEventListener("change",()=>{
  const next=$("ui-currency").value,rate=fxRate();
  if(!(rate>0&&Number.isFinite(rate))){$("ui-currency").value=uiCurrency;showError(phrase("Введите положительный курс","Enter a positive exchange rate"));return;}
  const wasCurrent=result&&JSON.stringify(payload())===inputSignature;
  moneyInputs.forEach(name=>{const e=form.elements[name];if(e.value!=="")e.value=Number(e.value)*(next==="USD"?1/rate:rate);});
  uiCurrency=next;if(wasCurrent)inputSignature=JSON.stringify(payload());
  refreshCurrencyLabels();rerenderPresentation();updateLocaleUrl();
 });
 $("ui-language").addEventListener("change",()=>{
  avLanguage=$("ui-language").value;applyLocale();
  updateCatalog();
  for(const id of ["season-start","season-end"])Array.from($(id).options).forEach((o,i)=>o.textContent=new Intl.DateTimeFormat(avLanguage,{month:"long",timeZone:"UTC"}).format(new Date(Date.UTC(2024,i,1))));
  // Rebuild labels generated from dictionaries without touching their input nodes.
  document.querySelectorAll(".hazard").forEach((section,i)=>{section.querySelector("h3").textContent=t(["Заморозки","Засуха","Град"][i]);section.querySelectorAll("label").forEach((label,j)=>{label.firstChild.textContent=t(["Вероятность события, %/год","Потеря при событии, %","Предельное снижение вероятности, %","Предельное снижение тяжести, %"][j]);});});
  const sector=$("sector").value;$("yield-label").textContent=t({crop:"Базовая продуктивность, кг/га/год",aqua:"Базовая продуктивность, т/га/год",forest:"Базовая продуктивность, м³/га/год"}[sector]);$("price-label").textContent=t(sector==="forest"?"Цена продукции, руб/м³":"Цена продукции, руб/кг");
  sync();populateBenchmarks();refreshCurrencyLabels();rerenderPresentation();updateLocaleUrl();
  if(mapLocationNote)mapLocationNote.textContent=mapLocationSelected?`${phrase("Участок выбран на карте:","Site selected on the map:")} ${form.elements.lat.value}, ${form.elements.lon.value}`:t("Выберите участок на карте выше.");
 });
 form.elements.country.addEventListener("change",populateBenchmarks);
 form.elements.country.addEventListener("input",populateBenchmarks);
 $("capex-mode").addEventListener("change",refreshCostNote);$("capex-benchmark").addEventListener("change",refreshCostNote);
 $("usd-rub").addEventListener("change",()=>{if(fxRate()>0){refreshCurrencyLabels();rerenderPresentation();}});
 fetch(apiUrl("/cost-benchmarks")).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>{
  benchmarks=data;for(const country of new Set(["Russian Federation",...data.records.map(r=>r.country)])){const o=document.createElement("option");o.value=country;$("country-list").append(o);}populateBenchmarks();
 }).catch(()=>{$("cost-note").textContent=phrase("Не удалось загрузить справочник CAPEX. Доступны прежние настройки и ручной ввод.","Could not load CAPEX benchmarks. Existing assumptions and manual input remain available.");});
});
function updateLocaleUrl(){const u=new URL(location.href);u.searchParams.set("lang",avLanguage);u.searchParams.set("currency",uiCurrency);history.replaceState(null,"",u);}

const embedded = window.parent !== window && !ownerView;
let mapLocationSelected = !embedded;
let mapLocationNote;
if (embedded) {
 for (const name of ["lat","lon"]) {
  const input=form.elements[name];input.value="";input.readOnly=true;input.closest("label").hidden=true;
 }
 mapLocationNote=document.createElement("p");mapLocationNote.className="hint";
 mapLocationNote.setAttribute("role","status");mapLocationNote.textContent=t("Выберите участок на карте выше.");
 form.prepend(mapLocationNote);
}

const monthNames=[t("Январь"),t("Февраль"),t("Март"),t("Апрель"),t("Май"),t("Июнь"),t("Июль"),t("Август"),t("Сентябрь"),t("Октябрь"),t("Ноябрь"),t("Декабрь")];
for(const [id,selected] of [["season-start",4],["season-end",9]])monthNames.forEach((name,i)=>{const option=document.createElement("option");option.value=String(i+1);option.textContent=t(name);option.selected=i+1===selected;$(id).append(option);});
const hazards={frost:t("Заморозки"),drought:t("Засуха"),hail:t("Град")};
const hazardFields={probability_pct:t("Вероятность события, %/год"),loss_fraction_pct:t("Потеря при событии, %"),probability_reduction_pct:t("Предельное снижение вероятности, %"),severity_reduction_pct:t("Предельное снижение тяжести, %")};
for(const [key,name] of Object.entries(hazards)){
 const section=document.createElement("div");section.className="hazard";
 const title=document.createElement("h3");title.textContent=name;section.append(title);
 const fields=document.createElement("div");fields.className="fields";
 for(const [field,text] of Object.entries(hazardFields)){
  const label=document.createElement("label");label.textContent=text;
  const input=document.createElement("input");Object.assign(input,{type:"number",name:`${key}_${field}`,min:field.includes("reduction")?"-100":"0",max:"100",step:"any",value:"0"});label.append(input);fields.append(label);
 }
 section.append(fields);$("hazards").append(section);
}
function toggle(id,visible){const el=$(id);el.hidden=!visible;el.querySelectorAll("input,select").forEach(x=>{x.disabled=!visible;x.required=visible&&x.type!=="checkbox";});}
function sync(){
 const crop=$("sector").value==="crop";
 document.querySelectorAll(".crop-only").forEach(s=>{s.hidden=!crop;s.querySelectorAll("input").forEach(i=>i.disabled=!crop);});
 toggle("baseline-mode-field",crop);toggle("baseline-field",!crop||$("baseline-mode").value==="manual");
 toggle("water-fields",crop&&$("water-enabled").checked);toggle("risks-fields",crop&&$("risks-enabled").checked);
 toggle("wacc-fields",$("capital-method").value==="wacc");toggle("direct-rate",$("capital-method").value==="direct");
 const automatic=$("weather-source").value==="nasa";
 $("load-weather").hidden=!automatic;
 for(const name of ["radiation_annual","growing_season_temperature_c","growing_season_rainfall_mm"]){const field=form.elements[name];field.readOnly=automatic;field.required=!automatic;if(automatic&&!field.dataset.loaded)field.value="";}
 $("weather-status").textContent=automatic?t("Погода загружается по координатам и выбранному сезону."):t("Введите погодные данные за выбранный сезон.");
}
function updateCatalog(){
 const previous=$("product-list").value;
 $("product-list").replaceChildren();for(const item of catalog[$("sector").value]||[]){const op=document.createElement("option");op.value=item.name;op.textContent=t(item.name);$("product-list").append(op);}
 const names=(catalog[$("sector").value]||[]).map(item=>item.name);
 if(names.includes(previous))$("product-list").value=previous;
 else if(names.includes("Пшеница"))$("product-list").value="Пшеница";
}
for(const id of ["baseline-mode","water-enabled","risks-enabled","capital-method","weather-source"])$(id).addEventListener("change",sync);
$("sector").addEventListener("change",()=>{
 const s=$("sector").value;
 const cfg={crop:["Пшеница",4000,15,t("Базовая продуктивность, кг/га/год"),t("Цена продукции, руб/кг")],aqua:["Белоногая креветка",5,150,t("Базовая продуктивность, т/га/год"),t("Цена продукции, руб/кг")],forest:["Тополь",5,5000,t("Базовая продуктивность, м³/га/год"),t("Цена продукции, руб/м³")]}[s];
 ["product_name","base_productivity","product_price"].forEach((k,i)=>form.elements[k].value=cfg[i]);$("yield-label").textContent=cfg[3];$("price-label").textContent=cfg[4];
 $("baseline-note").textContent=s==="crop"?t("Средняя урожайность страны — ориентир. Если есть данные вашего поля, выберите ручной ввод."):t("Укажите базовую продуктивность вашего хозяйства.");
 updateCatalog();sync();if(uiCurrency==="USD")form.elements.product_price.value=Number(cfg[2])/fxRate();refreshCurrencyLabels();
});
form.addEventListener("input",()=>{if(result){$("stale").hidden=false;$("choose").disabled=true;}});
fetch(apiUrl("/products")).then(r=>r.json()).then(data=>{catalog=data;updateCatalog();}).catch(()=>{showError(t("Не удалось загрузить список культур. Обновите страницу."));$("calculate").disabled=true;});
sync();
function payload(){
 const f=new FormData(form),n=k=>Number(f.get(k));
 const r={sector:f.get("sector"),product_name:f.get("product_name"),country:f.get("country")};
 for(const k of ["lat","lon","area_ha","product_price","energy_price","project_years","weather_year","season_start_month","season_end_month","irrigation_mm"])r[k]=n(k);
 if(r.sector!=="crop"||f.get("baseline_mode")==="manual")r.base_productivity=n("base_productivity");
 if(f.get("budget_rub"))r.budget_rub=n("budget_rub");
 if(f.get("weather_source")==="manual"){for(const key of ["radiation_annual","growing_season_temperature_c","growing_season_rainfall_mm"])r[key]=n(key);}
 r.capital={method:f.get("capital_method")};
 const fields=r.capital.method==="direct"?["discount_rate_pct"]:["equity_share_pct","cost_of_equity_pct","cost_of_debt_pct","tax_rate_pct"];
 fields.forEach(k=>r.capital[k]=n(k));
 if(r.sector==="crop"&&f.has("water_enabled")){r.water={};["baseline_et_mm","soil_evaporation_mm","effective_rainfall_mm","irrigation_efficiency","water_cost_rub_m3"].forEach(k=>r.water[k]=n(k));}
 if(r.sector==="crop"&&f.has("risks_enabled")){
  r.risks={events_are_mutually_exclusive:f.has("events_are_mutually_exclusive"),include_in_cash_flow:f.has("include_in_cash_flow")};
  for(const key of Object.keys(hazards)){r.risks[key]={};for(const field of Object.keys(hazardFields))r.risks[key][field]=n(`${key}_${field}`);}
 }
 for(const k of ["product_price","energy_price","budget_rub"])if(r[k]!=null)r[k]=inputMoney(r[k]);
 if(r.water)r.water.water_cost_rub_m3=inputMoney(r.water.water_cost_rub_m3);
 r.capex_mode=$("capex-mode").value;
 if(r.capex_mode==="country")r.capex_benchmark_id=$("capex-benchmark").value;
 if(r.capex_mode==="manual")r.capex_per_kw_rub=inputMoney(n("capex_per_kw_rub"));
 r.av_premium_pct=n("av_premium_pct");r.usd_rub=fxRate();r.fx_date=$("fx-date").value;
 // Presentation is not an economic input. Saved monetary results remain RUB.
 r.display_currency="RUB";
 return r;
}
function errorText(detail){return Array.isArray(detail)?detail.map(e=>`${e.loc.slice(1).join(".")}: ${e.msg}`).join("; "):typeof detail==="string"?translatedError(detail):t("Не удалось завершить действие");}
async function call(url,body){const response=await fetch(apiUrl(url),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(errorText(data.detail));return data;}
function showError(message){$("error").textContent=translatedError(message);$("error").hidden=false;}
function effect(label,value){const row=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label;dd.textContent=value;row.append(dt,dd);$("effects").append(row);}
function preview(index){
 currentVariant=result.variants[index];const v=currentVariant,e=v.economics;
 $("variant-title").textContent=phrase(`Просмотр варианта ${index+1}`, `Viewing option ${index+1}`);
 $("yield").textContent=fmt(v.productivity.estimated,1);$("yield-change").textContent=`${t(v.productivity.unit)} · ${fmt(v.productivity.change_pct,1)}% ${phrase("к базе","vs baseline")}`;
 $("generation").textContent=fmt(v.energy.annual_generation_kwh/1000,1)+" "+t("МВт·ч")+"";$("power").textContent=fmt(v.energy.installed_power_kw,1)+" "+t("кВт установленной мощности")+"";
 $("npv").textContent=money(e.npv_rub,true);$("rate-used").textContent=`${fmt(e.discount_rate_pct,2)}% · ${e.project_years} ${t("лет")}`;
 $("income").textContent=money(e.net_income,true);
 $("effects").replaceChildren();
 if(ownerView&&v.configuration){const g=v.configuration;effect(t("Модуль"),`${fmt(g.panel_power_w)} W · ${fmt(g.panel_length_m*1000)} × ${fmt(g.panel_width_m*1000)} mm`);effect(t("КПД модуля"),fmt(g.panel_efficiency*100,2)+"%");effect(t("Площадь модулей"),fmt(g.panel_area_total_m2,1)+" "+t("м²")+"");effect(t("Азимут"),fmt(g.azimuth_deg)+"°");effect(t("Просвет под нижним краем"),fmt(g.lower_edge_height_m,2)+" "+t("м")+"");effect(t("Шаг рядов"),fmt(g.pitch_m,2)+" "+t("м")+"");effect(t("Высота центра панелей"),fmt(g.height_m,2)+" "+t("м")+"");effect(t("Наклон"),fmt(g.tilt_deg,1)+"°");effect(t("Количество модулей"),fmt(g.num_panels));effect(t("Отношение площади модулей к земле"),fmt(100*g.gcr,1)+"%");effect(t("Проекция покрытия"),fmt(100*g.projected_coverage,1)+"%");}
 effect(t("Инвестиции"),money(e.capex));effect(t("Простая окупаемость"),e.roi_years==null?t("Не достигнута"):fmt(e.roi_years,1)+" "+t("лет")+"");effect(t("Дисконтированная окупаемость"),e.discounted_payback_years==null?t("Не достигнута"):fmt(e.discounted_payback_years,1)+" "+t("лет")+"");
 if(v.water.status!=="not_configured"){effect(t("Экономия воды"),fmt(v.water.saved_m3_year)+" "+t("м³/год"));effect(t("Снижение полива"),fmt(v.water.irrigation_reduction_pct,1)+"%");effect(t("Экономия на поливе"),money(v.water.annual_savings_rub)+phrase("/год","/year"));}
 $("risk-results").replaceChildren();if(v.risks.perils){for(const [key,p] of Object.entries(v.risks.perils)){const text=document.createElement("p");text.className="hint";text.textContent=`${t({frost:"Заморозки",drought:"Засуха",hail:"Град"}[key])}: ${fmt(p.baseline_probability_pct,2)}% → ${fmt(p.av_probability_pct,2)}%. ${phrase("Изменение ожидаемых потерь","Change in expected losses")}: ${money(p.avoided_expected_loss_rub)}${phrase("/год","/year")}.`;$("risk-results").append(text);}}
 $("robustness-note").textContent=phrase(`NPV от ${money(v.robustness.npv_min,true)} до ${money(v.robustness.npv_max,true)}. Неотрицательный NPV в ${v.robustness.positive_npv_scenarios} из ${v.robustness.scenario_count} сценариев.`, `NPV ranges from ${money(v.robustness.npv_min,true)} to ${money(v.robustness.npv_max,true)}. Non-negative NPV in ${v.robustness.positive_npv_scenarios} of ${v.robustness.scenario_count} scenarios.`);
 $("scenario-table").replaceChildren();for(const s of v.scenarios){const tr=document.createElement("tr");for(const text of [translatedScenario(s.name),fmt(s.productivity,1),fmt(s.generation_kwh/1000,1),fmt(displayMoney(s.npv_rub)/1e6,2)]){const td=document.createElement("td");td.textContent=text;tr.append(td);}$("scenario-table").append(tr);}
 $("selection-status").textContent=result.selected_variant_id===v.id?t("Вы выбрали этот вариант."):ownerView?t("Выбор действует в этом окне. Скачайте результат, чтобы сохранить его."):t("Просмотр не меняет ваш выбор. Нажмите кнопку, чтобы сохранить решение.");
 $("choose").textContent=result.selected_variant_id===v.id?t("Этот вариант выбран"):t("Выбрать этот вариант");
 $("choose").disabled=JSON.stringify(payload())!==inputSignature;
 document.querySelectorAll("#variant-buttons button").forEach((b,i)=>{b.classList.toggle("active",i===index);b.setAttribute("aria-pressed",String(i===index));});
}
function draw(){
 const svg=$("pareto-chart");svg.replaceChildren();const ns="http://www.w3.org/2000/svg";
 const energy=result.variants.map(v=>v.energy.annual_generation_kwh/1000),yieldValues=result.variants.map(v=>v.productivity.estimated);
 const xmin=Math.min(...energy),xmax=Math.max(...energy),ymin=Math.min(...yieldValues),ymax=Math.max(...yieldValues);
 const x=v=>65+(v-xmin)/(xmax-xmin||1)*405,y=v=>190-(v-ymin)/(ymax-ymin||1)*150;
 const el=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));if(text)e.textContent=text;svg.append(e);return e;};
 el("path",{d:"M65 25V190H480",fill:"none",stroke:"#acbbab"});
 el("text",{x:65,y:225,"font-size":11,fill:"#66776e"},`${phrase("Выработка","Generation")}: ${fmt(xmin)} → ${fmt(xmax)} ${t("МВт·ч/год")}`);
 el("text",{x:65,y:15,"font-size":11,fill:"#66776e"},`${t("Продуктивность")}: ${fmt(ymin,1)} → ${fmt(ymax,1)} ${t(result.variants[0].productivity.unit)}`);
 result.variants.forEach((v,i)=>{const point=el("circle",{cx:x(energy[i]),cy:y(yieldValues[i]),r:7,fill:v.economics.npv_rub>=0?"#266749":"#ac8048",tabindex:0,role:"button","aria-label":phrase(`Посмотреть вариант ${i+1}`, `View option ${i+1}`)});point.addEventListener("click",()=>preview(i));point.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();preview(i);}});const tooltip=document.createElementNS(ns,"title");tooltip.textContent=`${t("Вариант")} ${i+1}: NPV ${money(v.economics.npv_rub)}`;point.append(tooltip);});
}
function render(data){
 result=data;$("result").hidden=false;
 document.getElementById("owner-configurations")?.remove();
 if(ownerView){
  const card=document.createElement("div");card.id="owner-configurations";card.className="card";
  const title=document.createElement("h3");title.textContent=t("Конфигурации всех вариантов");card.append(title);
  const scroll=document.createElement("div");scroll.className="table-scroll";const table=document.createElement("table");
  const header=document.createElement("tr");for(const label of [t("Вариант"),t("Шаг, м"),t("Высота, м"),t("Наклон, °"),t("Модули"),"GCR, %",t("Проекция, %")]){const th=document.createElement("th");th.textContent=label;header.append(th);}table.append(header);
  data.variants.forEach((v,i)=>{const g=v.configuration,tr=document.createElement("tr");for(const value of [i+1,fmt(g.pitch_m,2),fmt(g.height_m,2),fmt(g.tilt_deg,1),fmt(g.num_panels),fmt(g.gcr*100,1),fmt(g.projected_coverage*100,1)]){const td=document.createElement("td");td.textContent=String(value);tr.append(td);}table.append(tr);});
  scroll.append(table);card.append(scroll);$("result").prepend(card);
 }$("stale").hidden=true;
 $("result-title").textContent=`${t(data.product_name)} · ${data.variants.length} ${phrase("вариантов","options")}`;
 $("result-note").textContent=t("Сравните продуктивность, выработку и доходность. Выберите подходящий вариант.");
 $("variant-buttons").replaceChildren();data.variants.forEach((v,i)=>{const button=document.createElement("button");button.type="button";button.textContent=String(i+1);button.setAttribute("aria-label",`${t("Вариант")} ${i+1}`);button.addEventListener("click",()=>preview(i));$("variant-buttons").append(button);});
 $("comparison-table").replaceChildren();data.variants.forEach((v,i)=>{const tr=document.createElement("tr");const td=document.createElement("td"),button=document.createElement("button");button.type="button";button.className="table-variant";button.textContent=String(i+1);button.setAttribute("aria-label",phrase(`Открыть вариант ${i+1}`, `Open option ${i+1}`));button.addEventListener("click",()=>preview(i));td.append(button);tr.append(td);for(const text of [fmt(v.productivity.estimated,1),fmt(v.energy.annual_generation_kwh/1000,1),fmt(displayMoney(v.economics.npv_rub)/1e6,2),fmt(displayMoney(v.economics.net_income)/1e6,2)]){const cell=document.createElement("td");cell.textContent=text;tr.append(cell);}$("comparison-table").append(tr);});

 showCostBasis(data);$("calculation-id").textContent=`${phrase("Номер расчёта","Calculation ID")}: ${data.calculation_id}`;draw();preview(0);
}
form.addEventListener("submit",async event=>{
 event.preventDefault();if(!mapLocationSelected){showError(t("Сначала выберите участок на карте."));return;}$("calculate").disabled=true;$("progress").hidden=false;$("error").hidden=true;
 const request=payload(),signature=JSON.stringify(request);
 try{const response=await call("/calculate",request);inputSignature=signature;render(response.data);if($("weather-source").value==="nasa"&&JSON.stringify(payload())===signature){for(const [key,value] of Object.entries(response.data.weather)){form.elements[key].value=Number(value.toFixed(2));form.elements[key].dataset.loaded="true";}}if(JSON.stringify(payload())!==signature)$("stale").hidden=false;}
 catch(error){showError(error.message);}finally{$("calculate").disabled=false;$("progress").hidden=true;}
});
$("choose").addEventListener("click",async()=>{
 if(!result||!currentVariant)return;
 if(JSON.stringify(payload())!==inputSignature){showError(t("Данные изменены. Сначала пересчитайте варианты."));return;}
 if(ownerView){result.selected_variant_id=currentVariant.id;if(result.calculation_details)result.calculation_details.selected_variant_id=currentVariant.id;preview(result.variants.findIndex(v=>v.id===currentVariant.id));return;}
 $("choose").disabled=true;
 try{const answer=await call(`/calculations/${result.calculation_id}/selection`,{variant_id:currentVariant.id});result.selected_variant_id=answer.selected_variant_id;preview(result.variants.findIndex(v=>v.id===currentVariant.id));}
 catch(error){showError(error.message);$("choose").disabled=false;}
});
$("download").addEventListener("click",()=>{if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(exportResult(),null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="agrivoltaic-options.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});

$("load-weather").addEventListener("click",async()=>{
 if(!mapLocationSelected){$("weather-status").textContent=t("Сначала выберите участок на карте.");return;}
 $("load-weather").disabled=true;$("weather-status").textContent=t("Загружаем погодные данные…");
 const signature=weatherSignature();
 try{const params=new URLSearchParams({lat:form.elements.lat.value,lon:form.elements.lon.value,year:form.elements.weather_year.value,start_month:$("season-start").value,end_month:$("season-end").value});
 const response=await fetch(apiUrl(`/weather?${params}`)),data=await response.json();if(!response.ok)throw new Error(errorText(data.detail));
 if(signature!==weatherSignature()||$("weather-source").value!=="nasa")return;
 for(const [key,value] of Object.entries(data)){form.elements[key].value=Number(value.toFixed(2));form.elements[key].dataset.loaded="true";}
 $("weather-status").textContent=t("Погодные данные загружены.");
 }catch(error){$("weather-status").textContent=translatedError(error.message);}finally{$("load-weather").disabled=false;if(signature!==weatherSignature()&&$("weather-source").value==="nasa")$("load-weather").click();}
});
function weatherSignature(){return ["lat","lon","weather_year","season_start_month","season_end_month"].map(k=>form.elements[k].value).join("|");}
for(const name of ["lat","lon","weather_year","season_start_month","season_end_month"])form.elements[name].addEventListener("input",()=>{if($("weather-source").value==="nasa"){for(const key of ["radiation_annual","growing_season_temperature_c","growing_season_rainfall_mm"]){form.elements[key].value="";delete form.elements[key].dataset.loaded;}$("weather-status").textContent=t("Условия изменены. Загрузите погоду заново или начните расчёт.");}});

// Only the configured Tilda parent may supply map coordinates.
fetch(apiUrl("/integration/config")).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(config=>{
 const parents=new Set(config.parent_origins);
 if(embedded&&!parents.size){showError(t("Карта не подключена к калькулятору: адрес сайта не настроен. Обратитесь к владельцу сайта."));return;}
 if(embedded&&document.referrer){const parentOrigin=new URL(document.referrer).origin;if(!parents.has(parentOrigin)){showError(t("Калькулятор не подключён к карте на этом адресе сайта. Обратитесь к владельцу сайта."));return;}}
 window.addEventListener("message",event=>{
  if(window.parent===window||event.source!==window.parent||!parents.has(event.origin))return;
  const data=event.data;
  if(!data||data.type!=="agrivoltaic:location"||typeof data.lat!=="number"||typeof data.lon!=="number"||!Number.isFinite(data.lat)||!Number.isFinite(data.lon)||Math.abs(data.lat)>90||Math.abs(data.lon)>180)return;
  mapLocationSelected=true;
  if(mapLocationNote)mapLocationNote.textContent=""+t("Участок выбран на карте:")+" "+data.lat.toFixed(5)+", "+data.lon.toFixed(5);
  $("error").hidden=true;
  form.elements.lat.value=data.lat.toFixed(6);form.elements.lon.value=data.lon.toFixed(6);
  form.elements.lat.dispatchEvent(new Event("input",{bubbles:true}));
  if($("weather-source").value==="nasa")$("load-weather").click();
 });
 if(window.parent!==window){for(const origin of parents)window.parent.postMessage({type:"agrivoltaic:ready"},origin);}
}).catch(()=>{if(embedded)showError(t("Не удалось подключить карту к калькулятору. Обновите страницу."));});
