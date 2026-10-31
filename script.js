(() => {
  'use strict';

  const LIMIT = 10000;
  const SAMPLES = {
    arithmetic: `let a = 8;\nlet b = 2.5;\nlet total = a * b + 4;\nprint(total);\nprint(total / 2);`,
    conditional: `let score = 17;\nif (score >= 18) {\n  print(1);\n} else {\n  print(0);\n}\nlet same = score != 0;\nprint(same);`,
    loop: `let x = 1;\nlet total = 0;\nwhile (x <= 5) {\n  total = total + x;\n  x = x + 1;\n}\nprint(total);\nprint(x);`
  };

  class LangError extends Error {
    constructor(message, line = 1, column = 1) { super(`${message} (line ${line}, column ${column})`); this.name = 'LangError'; this.line = line; this.column = column; }
  }
  class Lexer {
    constructor(source) { this.source = source; this.tokens = []; this.index = 0; this.line = 1; this.column = 1; }
    advance() { const c = this.source[this.index++]; if (c === '\n') { this.line++; this.column = 1; } else this.column++; return c; }
    peek(offset = 0) { return this.source[this.index + offset] || ''; }
    add(type, value, line = this.line, column = this.column) { this.tokens.push({ type, value, line, column }); }
    scan() {
      while (this.index < this.source.length) {
        const c = this.peek();
        if (/\s/.test(c)) { this.advance(); continue; }
        const line = this.line, col = this.column;
        if (/[0-9]/.test(c)) {
          let n = ''; while (/[0-9]/.test(this.peek())) n += this.advance();
          if (this.peek() === '.' && /[0-9]/.test(this.peek(1))) { n += this.advance(); while (/[0-9]/.test(this.peek())) n += this.advance(); }
          this.add('NUMBER', Number(n), line, col); continue;
        }
        if (/[A-Za-z_]/.test(c)) {
          let id = ''; while (/[A-Za-z0-9_]/.test(this.peek())) id += this.advance();
          this.add(({let:'LET',if:'IF',else:'ELSE',while:'WHILE',print:'PRINT'})[id] || 'IDENT', id, line, col); continue;
        }
        if ('=!<>'.includes(c) && this.peek(1) === '=') { const op = this.advance() + this.advance(); this.add(op, op, line, col); continue; }
        if ('+-*/(){};=<>'.includes(c)) { this.advance(); this.add(c, c, line, col); continue; }
        throw new LangError(`Unexpected character “${c}”`, line, col);
      }
      this.add('EOF', '', this.line, this.column); return this.tokens;
    }
  }
  class Parser {
    constructor(tokens) { this.tokens = tokens; this.pos = 0; }
    current() { return this.tokens[this.pos]; }
    check(type) { return this.current().type === type; }
    take(type, message) { if (!this.check(type)) { const t=this.current(); throw new LangError(message || `Expected ${type}, found ${t.type}${t.value ? ` “${t.value}”` : ''}`,t.line,t.column); } return this.tokens[this.pos++]; }
    match(...types) { if (types.includes(this.current().type)) return this.tokens[this.pos++]; return null; }
    parse() { const statements=[]; while (!this.check('EOF')) statements.push(this.statement()); return {type:'Program',statements}; }
    statement() {
      if (this.match('LET')) { const name=this.take('IDENT','Expected variable name after let'); this.take('=','Expected “=” in declaration'); const value=this.expression(); this.take(';','Expected “;” after declaration'); return {type:'Let',name:name.value,value,line:name.line}; }
      if (this.match('PRINT')) { const t=this.tokens[this.pos-1]; this.take('(','Expected “(” after print'); const value=this.expression(); this.take(')','Expected “)” after print value'); this.take(';','Expected “;” after print'); return {type:'Print',value,line:t.line}; }
      if (this.match('IF')) { const t=this.tokens[this.pos-1]; this.take('(','Expected “(” after if'); const test=this.expression(); this.take(')','Expected “)” after condition'); const then=this.block(); const otherwise=this.match('ELSE') ? this.block() : null; return {type:'If',test,then,otherwise,line:t.line}; }
      if (this.match('WHILE')) { const t=this.tokens[this.pos-1]; this.take('(','Expected “(” after while'); const test=this.expression(); this.take(')','Expected “)” after condition'); return {type:'While',test,body:this.block(),line:t.line}; }
      if (this.match('{')) { this.pos--; return this.block(); }
      if (this.check('IDENT') && this.tokens[this.pos+1]?.type === '=') { const name=this.take('IDENT'); this.take('='); const value=this.expression(); this.take(';','Expected “;” after assignment'); return {type:'Assign',name:name.value,value,line:name.line}; }
      const t=this.current(); throw new LangError(`Expected a statement, found ${t.type}${t.value ? ` “${t.value}”` : ''}`,t.line,t.column);
    }
    block() { this.take('{','Expected “{” to start block'); const statements=[]; while (!this.check('}') && !this.check('EOF')) statements.push(this.statement()); this.take('}','Expected “}” to close block'); return {type:'Block',statements}; }
    expression() { return this.comparison(); }
    comparison() { let e=this.additive(); while (this.match('<','>','<=','>=','==','!=')) { const op=this.tokens[this.pos-1].type; e={type:'Binary',op,left:e,right:this.additive()}; } return e; }
    additive() { let e=this.multiplicative(); while (this.match('+','-')) { const op=this.tokens[this.pos-1].type; e={type:'Binary',op,left:e,right:this.multiplicative()}; } return e; }
    multiplicative() { let e=this.primary(); while (this.match('*','/')) { const op=this.tokens[this.pos-1].type; e={type:'Binary',op,left:e,right:this.primary()}; } return e; }
    primary() { if (this.match('NUMBER')) return {type:'Number',value:this.tokens[this.pos-1].value}; if (this.match('IDENT')) return {type:'Variable',name:this.tokens[this.pos-1].value,line:this.tokens[this.pos-1].line}; if (this.match('(')) { const e=this.expression(); this.take(')','Expected “)” after expression'); return e; } const t=this.current(); throw new LangError(`Expected a number, variable, or parenthesized expression; found ${t.type}`,t.line,t.column); }
  }
  class Interpreter {
    constructor(limit=LIMIT) { this.limit=limit; this.count=0; this.env=Object.create(null); this.output=[]; this.trace=[]; }
    tick(node, detail='') { if (++this.count > this.limit) throw new LangError(`Execution step limit (${this.limit}) exceeded`,node.line||1,1); if (this.trace.length<300) this.trace.push(`AST ${String(this.count).padStart(4,'0')}  ${node.type}${detail ? `  ${detail}` : ''}`); }
    execute(program) { for (const s of program.statements) this.statement(s); return {output:this.output,env:this.env,count:this.count,trace:this.trace}; }
    statement(n) { this.tick(n); switch(n.type) { case 'Block': for(const s of n.statements)this.statement(s); break; case 'Let': this.env[n.name]=this.evaluate(n.value); break; case 'Assign': if(!Object.hasOwn(this.env,n.name))throw new LangError(`Undefined variable “${n.name}”`,n.line); this.env[n.name]=this.evaluate(n.value); break; case 'Print': this.output.push(formatValue(this.evaluate(n.value))); break; case 'If': this.statement(truthy(this.evaluate(n.test))?n.then:(n.otherwise||{type:'Block',statements:[],line:n.line})); break; case 'While': while(truthy(this.evaluate(n.test))){this.tick(n,'loop iteration');this.statement(n.body);} break; default: throw new LangError(`Unsupported statement ${n.type}`,n.line||1); } }
    evaluate(n) { this.tick(n); if(n.type==='Number')return n.value; if(n.type==='Variable'){if(!Object.hasOwn(this.env,n.name))throw new LangError(`Undefined variable “${n.name}”`,n.line);return this.env[n.name];} if(n.type==='Binary'){const a=this.evaluate(n.left),b=this.evaluate(n.right);return applyOp(n.op,a,b, n.line||1);} throw new LangError(`Unsupported expression ${n.type}`,n.line||1); }
  }
  class CodeGenerator {
    constructor(){this.code=[];this.temp=0;this.label=0;}
    emit(op,...args){this.code.push({op,args});}
    tempName(){return `t${++this.temp}`;} labelName(){return `L${++this.label}`;}
    compile(program){for(const s of program.statements)this.statement(s);return this.code;}
    expression(n){if(n.type==='Number'){const t=this.tempName();this.emit('LOAD_CONST',n.value,t);return t;}if(n.type==='Variable'){const t=this.tempName();this.emit('LOAD',n.name,t,n.line);return t;}if(n.type==='Binary'){const a=this.expression(n.left),b=this.expression(n.right),t=this.tempName();const map={'+':'ADD','-':'SUB','*':'MUL','/':'DIV','<':'CMP_LT','>':'CMP_GT','<=':'CMP_LE','>=':'CMP_GE','==':'CMP_EQ','!=':'CMP_NE'};this.emit(map[n.op],a,b,t,n.line||1);return t;}throw new LangError(`Unsupported expression ${n.type}`,n.line||1);}
    statement(n){if(n.type==='Block'){for(const s of n.statements)this.statement(s);return;}if(n.type==='Let'||n.type==='Assign'){const t=this.expression(n.value);this.emit('STORE',n.name,t,n.line);return;}if(n.type==='Print'){this.emit('PRINT',this.expression(n.value),n.line);return;}if(n.type==='If'){const cond=this.expression(n.test),elseLabel=this.labelName(),endLabel=this.labelName();this.emit('JMP_IF_FALSE',cond,elseLabel,n.line);this.statement(n.then);if(n.otherwise){this.emit('JMP',endLabel);this.emit('LABEL',elseLabel);this.statement(n.otherwise);this.emit('LABEL',endLabel);}else this.emit('LABEL',elseLabel);return;}if(n.type==='While'){const start=this.labelName(),end=this.labelName();this.emit('LABEL',start);const cond=this.expression(n.test);this.emit('JMP_IF_FALSE',cond,end,n.line);this.statement(n.body);this.emit('JMP',start);this.emit('LABEL',end);return;}throw new LangError(`Unsupported statement ${n.type}`,n.line||1);}
  }
  class VirtualMachine {
    constructor(code,limit=LIMIT){this.code=code;this.limit=limit;this.env=Object.create(null);this.temps=Object.create(null);this.labels=new Map();this.output=[];this.trace=[];this.count=0;code.forEach((x,i)=>{if(x.op==='LABEL')this.labels.set(x.args[0],i);});}
    read(ref,line=1){if(ref in this.temps)return this.temps[ref];if(Object.hasOwn(this.env,ref))return this.env[ref];throw new LangError(`Undefined variable “${ref}”`,line);}
    run(){let pc=0;while(pc<this.code.length){if(++this.count>this.limit)throw new LangError(`Execution step limit (${this.limit}) exceeded`,1);const {op,args}=this.code[pc];if(this.trace.length<400)this.trace.push(`VM  ${String(this.count).padStart(4,'0')}  ${String(pc).padStart(3,'0')}  ${formatInstruction({op,args})}`);let jump=null;switch(op){case'LABEL':break;case'LOAD_CONST':this.temps[args[1]]=args[0];break;case'LOAD':this.temps[args[1]]=this.read(args[0],args[2]);break;case'STORE':this.env[args[0]]=this.read(args[1],args[2]);break;case'ADD':case'SUB':case'MUL':case'DIV':case'CMP_LT':case'CMP_GT':case'CMP_LE':case'CMP_GE':case'CMP_EQ':case'CMP_NE':{const operators={CMP_LT:'<',CMP_GT:'>',CMP_LE:'<=',CMP_GE:'>=',CMP_EQ:'==',CMP_NE:'!='};const op2=operators[op]||({ADD:'+',SUB:'-',MUL:'*',DIV:'/'}[op]);this.temps[args[2]]=applyOp(op2,this.read(args[0],args[3]),this.read(args[1],args[3]),args[3]);break;}case'JMP':jump=args[0];break;case'JMP_IF_FALSE':if(!truthy(this.read(args[0],args[2])))jump=args[1];break;case'PRINT':this.output.push(formatValue(this.read(args[0],args[1])));break;default:throw new LangError(`Unknown VM instruction ${op}`,1);}if(jump!==null){if(!this.labels.has(jump))throw new LangError(`Unknown label “${jump}”`,1);pc=this.labels.get(jump);}else pc++;}return{output:this.output,env:this.env,count:this.count,trace:this.trace};}
  }
  class Profiler {
    constructor(){this.warmups=2;this.runs=9;}
    measure(fn){for(let i=0;i<this.warmups;i++)fn();const values=[];let result;for(let i=0;i<this.runs;i++){const start=performance.now();result=fn();values.push(performance.now()-start);}return{ms:values.reduce((a,b)=>a+b,0)/values.length,result};}
  }
  function applyOp(op,a,b,line){switch(op){case'+':return a+b;case'-':return a-b;case'*':return a*b;case'/':if(b===0)throw new LangError('Division by zero',line);return a/b;case'<':return a<b;case'>':return a>b;case'<=':return a<=b;case'>=':return a>=b;case'==':return a===b;case'!=':return a!==b;default:throw new LangError(`Unsupported operator ${op}`,line);}}
  function truthy(v){return v===true || (typeof v==='number'&&v!==0);}
  function formatValue(v){return typeof v==='number'&&Number.isInteger(v)?String(v):String(v);}
  function us(ms){return `${(ms*1000).toFixed(2)} μs`;}
  function formatInstruction(i){const a=i.args;switch(i.op){case'LABEL':return `${a[0]}:`;case'LOAD_CONST':return `LOAD_CONST ${a[0]} → ${a[1]}`;case'LOAD':return `LOAD ${a[0]} → ${a[1]}`;case'STORE':return `STORE ${a[0]}, ${a[1]}`;case'ADD':case'SUB':case'MUL':case'DIV':case'CMP_LT':case'CMP_GT':case'CMP_LE':case'CMP_GE':case'CMP_EQ':case'CMP_NE':return `${i.op} ${a[0]}, ${a[1]} → ${a[2]}`;case'JMP':return `JMP ${a[0]}`;case'JMP_IF_FALSE':return `JMP_IF_FALSE ${a[0]} → ${a[1]}`;case'PRINT':return `PRINT ${a[0]}`;default:return i.op;}}
  function serializeAst(n,depth=0){const pad='  '.repeat(depth);if(n.type==='Program'||n.type==='Block')return `${pad}${n.type}\n${n.statements.map(x=>serializeAst(x,depth+1)).join('\n')}`;if(n.type==='Let'||n.type==='Assign')return `${pad}${n.type} ${n.name}\n${serializeAst(n.value,depth+1)}`;if(n.type==='Print')return `${pad}Print\n${serializeAst(n.value,depth+1)}`;if(n.type==='If')return `${pad}If\n${serializeAst(n.test,depth+1)}\n${serializeAst(n.then,depth+1)}${n.otherwise?'\n'+serializeAst(n.otherwise,depth+1):''}`;if(n.type==='While')return `${pad}While\n${serializeAst(n.test,depth+1)}\n${serializeAst(n.body,depth+1)}`;if(n.type==='Binary')return `${pad}Binary ${n.op}\n${serializeAst(n.left,depth+1)}\n${serializeAst(n.right,depth+1)}`;if(n.type==='Variable')return `${pad}Variable ${n.name}`;return `${pad}Number ${n.value}`;}
  function flatten(node,out=[]){if(node.type==='Program'||node.type==='Block'){for(const s of node.statements)flatten(s,out);}else{out.push(node);if(node.type==='Let'||node.type==='Assign'||node.type==='Print')flatten(node.value,out);if(node.type==='Binary'){flatten(node.left,out);flatten(node.right,out);}if(node.type==='If'){flatten(node.test,out);flatten(node.then,out);if(node.otherwise)flatten(node.otherwise,out);}if(node.type==='While'){flatten(node.test,out);flatten(node.body,out);}}return out;}
  function lineView(text){return text.split('\n').map((x,i)=>`${String(i+1).padStart(3,' ')}  ${x}`).join('\n');}

  const $=id=>document.getElementById(id);let latest=null,activeTab='source';
  const tabs={source:()=>`SOURCE TEXT\n${lineView($('sourceEditor').value)}`,ast:()=>latest?serializeAst(latest.ast):'Run a program to generate its AST.',ir:()=>latest?latest.code.map((x,i)=>`${String(i).padStart(3,'0')}  ${formatInstruction(x)}`).join('\n'):'Run a program to generate intermediate code.',trace:()=>latest?`INTERPRETER · ${latest.i.result.trace.length} recorded steps\n${latest.i.result.trace.join('\n')}\n\nVIRTUAL MACHINE · ${latest.vm.result.trace.length} recorded steps\n${latest.vm.result.trace.join('\n')}`:'Run a program to capture execution traces.',report:()=>latest?`DUALCORE PERFORMANCE REPORT\nMeasurements are approximate. Warm-up: ${latest.warmups} runs · Measured: ${latest.runs} runs\n\nINTERPRETER\n  Lexical analysis       ${us(latest.iLex.ms)}\n  Parsing                ${us(latest.iParse.ms)}\n  AST execution          ${us(latest.iExec.ms)}\n  Total pipeline         ${us(latest.iTotal)}\n  AST evaluations        ${latest.i.result.count}\n\nCOMPILER + VM\n  Lexical analysis       ${us(latest.cLex.ms)}\n  Parsing                ${us(latest.cParse.ms)}\n  Code generation        ${us(latest.codegen.ms)}\n  VM execution           ${us(latest.vmExec.ms)}\n  Total pipeline         ${us(latest.cTotal)}\n  VM instructions        ${latest.vm.result.count}\n\nOUTPUTS ${latest.equal?'EQUIVALENT':'DIFFERENT'}`:'Run a program to generate the performance report.'};
  function renderTab(){const content=$('tabContent');content.innerHTML='';const pre=document.createElement('pre');pre.className='code-view';pre.textContent=tabs[activeTab]();content.append(pre);document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===activeTab));}
  function syncEditor(){const lines=$('sourceEditor').value.split('\n').length;$('lineNumbers').textContent=Array.from({length:lines},(_,i)=>i+1).join('\n');$('sourceMetrics').textContent=`${lines} LINES · ${Math.max(0,$('sourceEditor').value.trim().split(/\s+/).filter(Boolean).length)} TOKENS`;if(activeTab==='source')renderTab();}
  function setStatus(prefix,status,kind,time){$(`${prefix}Status`).textContent=status;$(`${prefix}Pip`).className=`status-pip ${kind||''}`;$(`${prefix}Time`).textContent=time||'—';}
  function drawChart(i,c){const chart=$('timingChart');chart.innerHTML='';const max=Math.max(i,c,0.01);for(const [name,val,cls] of [['INTERPRETER',i,'interpreter'],['COMPILER + VM',c,'compiler']]){const group=document.createElement('div');group.className='bar-group';const label=document.createElement('span');label.className='bar-label';label.textContent=name==='INTERPRETER'?'INT':'CMP';const bars=document.createElement('div');bars.className='bars';const bar=document.createElement('div');bar.className=`bar ${cls}`;bar.style.width=`${Math.max(1,Math.sqrt(val/max)*100)}%`;bars.append(bar);const value=document.createElement('span');value.className='bar-value';value.textContent=us(val);group.append(label,bars,value);chart.append(group);}}
  function renderResults(data){latest=data;$('interpreterOutput').textContent=data.i.result.output.join('\n')||'(no output)';$('compilerOutput').textContent=data.vm.result.output.join('\n')||'(no output)';$('iLex').textContent=us(data.iLex.ms);$('iParse').textContent=us(data.iParse.ms);$('iExec').textContent=us(data.iExec.ms);$('iCount').textContent=data.i.result.count.toLocaleString();$('cLex').textContent=us(data.cLex.ms);$('cParse').textContent=us(data.cParse.ms);$('cCodegen').textContent=us(data.codegen.ms);$('cExec').textContent=us(data.vmExec.ms);$('cCount').textContent=data.vm.result.count.toLocaleString();$('compilerTimeInline').textContent=us(data.cTotal);$('interpreterTime').textContent=us(data.iTotal);$('compilerTime').textContent=us(data.cTotal);setStatus('interpreter','COMPLETED','success',null);setStatus('compiler','COMPLETED','success',null);const eq=$('equivalence');eq.className=`equivalence ${data.equal?'':'failed'}`;eq.querySelector('.equivalence-icon').textContent=data.equal?'✓':'!';eq.querySelector('strong').textContent=data.equal?'OUTPUTS MATCH':'OUTPUT MISMATCH';eq.querySelector('small').textContent='OUTPUT EQUIVALENCE';drawChart(data.iTotal,data.cTotal);$('headerStatus').textContent='RUN COMPLETE · LOCAL RUNTIME';renderTab();}
  function parseTimed(source){let tokens,ast;const lexer=new Lexer(source);const start=performance.now();tokens=lexer.scan();const lexMs=performance.now()-start;const pStart=performance.now();ast=new Parser(tokens).parse();const parseMs=performance.now()-pStart;return{tokens,ast,lexMs,parseMs};}
  function run(){const source=$('sourceEditor').value;try{$('errorToast').hidden=true;$('headerStatus').textContent='EXECUTING · LOCAL RUNTIME';setStatus('interpreter','RUNNING','',null);setStatus('compiler','RUNNING','',null);
      // Independent measurements for each pipeline phase. Timed passes are rerun and their last result is used for display.
      const iLex=new Profiler().measure(()=>new Lexer(source).scan());const iParse=new Profiler().measure(()=>new Parser(iLex.result).parse());
      const cLex=new Profiler().measure(()=>new Lexer(source).scan());const cParse=new Profiler().measure(()=>new Parser(cLex.result).parse());const ast=cParse.result;
      const iExec=new Profiler().measure(()=>new Interpreter().execute(ast));
      const codegen=new Profiler().measure(()=>new CodeGenerator().compile(ast));const code=codegen.result;
      const vmExec=new Profiler().measure(()=>new VirtualMachine(code).run());
      const iResult=new Interpreter().execute(ast),vmResult=new VirtualMachine(code).run();const iTotal=iLex.ms+iParse.ms+iExec.ms,cTotal=cLex.ms+cParse.ms+codegen.ms+vmExec.ms;const equal=JSON.stringify(iResult.output)===JSON.stringify(vmResult.output);
      renderResults({ast,code,i:{result:iResult},vm:{result:vmResult},iLex,iParse,iExec,cLex,cParse,codegen,vmExec,iTotal,cTotal,equal,warmups:2,runs:9});
    }catch(err){$('headerStatus').textContent='RUN FAILED · INSPECT ERROR';setStatus('interpreter','ERROR','error',null);setStatus('compiler','ERROR','error',null);$('errorToast').textContent=err instanceof LangError?err.message:`Runtime error: ${err.message}`;$('errorToast').hidden=false;}}
  $('sourceEditor').value=SAMPLES.arithmetic;syncEditor();$('sampleSelect').addEventListener('change',e=>{$('sourceEditor').value=SAMPLES[e.target.value];syncEditor();});$('sourceEditor').addEventListener('input',syncEditor);$('sourceEditor').addEventListener('scroll',()=>$('lineNumbers').scrollTop=$('sourceEditor').scrollTop);$('sourceEditor').addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();const s=e.target.selectionStart,end=e.target.selectionEnd;e.target.setRangeText('  ',s,end,'end');syncEditor();}});$('runButton').addEventListener('click',run);$('resetButton').addEventListener('click',()=>{$('sourceEditor').value=SAMPLES.arithmetic;$('sampleSelect').value='arithmetic';latest=null;$('headerStatus').textContent='READY · LOCAL RUNTIME';$('interpreterOutput').textContent='Run a program to inspect output.';$('compilerOutput').textContent='Run a program to inspect output.';['iLex','iParse','iExec','iCount','cLex','cParse','cCodegen','cExec','cCount','compilerTimeInline'].forEach(id=>$(id).textContent='—');$('interpreterTime').textContent=$('compilerTime').textContent='—';setStatus('interpreter','AWAITING RUN','',null);setStatus('compiler','AWAITING RUN','',null);$('equivalence').className='equivalence pending';$('equivalence').querySelector('.equivalence-icon').textContent='—';$('equivalence').querySelector('strong').textContent='NO COMPARISON';$('timingChart').innerHTML='<div class="chart-empty">Timing profile appears after a run.</div>';$('errorToast').hidden=true;syncEditor();});document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{activeTab=b.dataset.tab;renderTab();}));
})();
